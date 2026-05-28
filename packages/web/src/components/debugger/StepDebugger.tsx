import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  isCallOp,
  isStorageOp,
  isLogOp,
  useOpcodeNavigation,
} from "@valve-tech/trace-sdk/hooks";
import {
  fetchOpcodeDetail,
  type OpcodeStep,
  type CallFrame,
  type StepDetail,
} from "../../api/debugger";
import { analyzeContract, type SlitherFinding } from "../../api/source";
import { useContractSource, useSourceMappings } from "../../hooks/useContractSource";
import { useContractMeta } from "../../hooks/useContractMeta";
import { useSignatures } from "../../hooks/useSignatures";
import FindingsPanel from "./SlitherFindingsPanel";
import { walkCallTree } from "./StepDebugger/callTreeHelpers";
import { mapFramesToSteps } from "./StepDebugger/callTreeModel";
import { computePcsByContract } from "./StepDebugger/executionScopes";
import { buildLogsByStep } from "./StepDebugger/logsByStep";
import { publishNavContext, publishNavState } from "./StepDebugger/navDiagnostics";
import { useTraceSourceMaps } from "../../hooks/useTraceSourceMaps";
import { CollapsiblePanel } from "./StepDebugger/CollapsiblePanel";
import { ResizablePanel } from "./StepDebugger/ResizablePanel";
import { ControlsBar } from "./StepDebugger/ControlsBar";
import { CallContextBreadcrumb } from "./StepDebugger/CallContextBreadcrumb";
import { CallTreeFromOpcodes } from "./StepDebugger/CallTreeFromOpcodes";
import { DecodedTrace } from "./StepDebugger/DecodedTrace";
import { SourceOpcodeSplit } from "./StepDebugger/SourceOpcodeSplit";
import { opcodeFrequencies } from "./StepDebugger/opcodeStats";
import { StoragePanel, type StorageDiff } from "./StepDebugger/StoragePanel";
import { StackPanel } from "./StepDebugger/StackPanel";
import { MemoryPanel } from "./StepDebugger/MemoryPanel";
import { ShortcutsHelp } from "./StepDebugger/ShortcutsHelp";
import { OperandBar } from "./StepDebugger/OperandBar";
import { describeOperands } from "./StepDebugger/opcodeOperands";
import { FrameOpcodesOverlay } from "./StepDebugger/FrameOpcodesOverlay";

interface DecodedLog {
  eventName: string;
  args: { type: string }[];
  logIndex: number;
}
interface RawLog {
  address: string;
  topics: string[];
  logIndex: number;
}

interface StepDebuggerProps {
  steps: OpcodeStep[];
  contractAddress?: string;
  callTrace?: CallFrame | null;
  txHash?: string | null;
  /** Receipt logs (emission order), used to decode the events in the tree. */
  decodedLogs?: DecodedLog[];
  rawLogs?: RawLog[];
}

// Per-step state (stack/memory/storage) is loaded lazily in chunks of this
// many steps. The skeleton trace carries none of it (it'd be ~70% of the
// payload across 100k+ steps); we fetch a window covering the cursor and let
// TanStack Query cache each chunk.
const DETAIL_CHUNK = 512;

export default function StepDebugger({
  steps,
  contractAddress,
  callTrace,
  txHash,
  decodedLogs,
  rawLogs,
}: StepDebuggerProps) {
  const nav = useOpcodeNavigation(steps);
  const { currentIndex: currentStep, totalSteps } = nav;

  // Lazy per-step state for the chunk containing the cursor. The first fetch
  // for a tx warms a server-side full-trace cache (~seconds); later chunks are
  // instant. Diffs read current + previous step out of the same chunk.
  const chunkStart = Math.floor(currentStep / DETAIL_CHUNK) * DETAIL_CHUNK;
  const detailQuery = useQuery({
    queryKey: ["opcode-detail", txHash, chunkStart],
    queryFn: () =>
      fetchOpcodeDetail(txHash!, chunkStart, chunkStart + DETAIL_CHUNK),
    enabled: !!txHash && steps.length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const detailMap = detailQuery.data?.detail ?? null;
  const detailLoading = detailQuery.isFetching && !detailMap;
  const currentDetail: StepDetail | null = detailMap?.[currentStep] ?? null;
  const prevDetail: StepDetail | null =
    currentStep > 0 ? detailMap?.[currentStep - 1] ?? null : null;

  const [opcodeFilter, setOpcodeFilter] = useState("");
  const [contentView, setContentView] = useState<"debugger" | "trace">("debugger");
  // Call-tree column width — resizable so long frame labels are readable.
  const [treeWidth, setTreeWidth] = useState(() => {
    const saved = Number(localStorage.getItem("debugger:treeWidth"));
    return saved >= 240 && saved <= 760 ? saved : 360;
  });
  const handleTreeResize = useCallback((w: number) => {
    setTreeWidth(w);
    localStorage.setItem("debugger:treeWidth", String(w));
  }, []);
  // A call frame whose opcode slice is shown in the expand overlay.
  const [expandedFrame, setExpandedFrame] = useState<
    { frame: CallFrame; from: number; label: string } | null
  >(null);
  const [slitherFindings, setSlitherFindings] = useState<SlitherFinding[]>([]);
  const [slitherLoading, setSlitherLoading] = useState(false);
  const [showFindings, setShowFindings] = useState(false);
  const [overrideLine, setOverrideLine] = useState<number | null>(null);
  const [pendingFuncSearch, setPendingFuncSearch] = useState<string | null>(null);
  const [scrollKey, setScrollKey] = useState(0);

  const maxDepth = useMemo(() => {
    let max = 1;
    for (const s of steps) if (s.depth > max) max = s.depth;
    return max;
  }, [steps]);

  // Exact opcode match: filtering to "ADD" should not also catch "ADDRESS",
  // and the highlighted count must equal the frequency tag's count.
  const filteredIndices = useMemo(() => {
    if (!opcodeFilter) return null;
    const upper = opcodeFilter.toUpperCase();
    const indices: number[] = [];
    for (let i = 0; i < steps.length; i++) {
      if (steps[i]!.op === upper) indices.push(i);
    }
    return indices;
  }, [opcodeFilter, steps]);

  const opcodeFreqs = useMemo(() => opcodeFrequencies(steps), [steps]);

  const toggleOpcode = useCallback(
    (op: string) => setOpcodeFilter((prev) => (prev === op ? "" : op)),
    [],
  );

  // Reset on new trace. The opcode-cursor reset is handled inside
  // useOpcodeNavigation (it watches `steps` identity); this effect only owns
  // the web-specific state that doesn't belong to the SDK hook.
  useEffect(() => {
    setOpcodeFilter("");
    setSlitherFindings([]);
    setShowFindings(false);
    setContentView("debugger");
    setExpandedFrame(null);
  }, [steps]);

  const handleAnalyze = useCallback(async () => {
    if (!contractAddress || slitherLoading) return;
    setSlitherLoading(true);
    try {
      const res = await analyzeContract(contractAddress);
      if (res.ok && res.analysis) {
        setSlitherFindings(res.analysis.findings);
        setShowFindings(true);
        setContentView("debugger");
      }
    } catch (err) {
      console.error("[StepDebugger] Slither analysis error:", err);
    } finally {
      setSlitherLoading(false);
    }
  }, [contractAddress, slitherLoading]);

  // Collect every address and selector reachable from the call tree
  // so we can warm contract-name and 4byte-signature caches up-front.
  const callTreeAddresses = useMemo(() => {
    if (!callTrace) return [];
    const addrs = new Set<string>();
    walkCallTree(callTrace, (f) => { if (f.to) addrs.add(f.to); });
    return [...addrs];
  }, [callTrace]);

  const callTreeSelectors = useMemo(() => {
    if (!callTrace) return [];
    const sels = new Set<string>();
    walkCallTree(callTrace, (f) => {
      if (f.input && f.input.length >= 10) sels.add(f.input.slice(0, 10).toLowerCase());
    });
    return [...sels];
  }, [callTrace]);

  const { names: contractNames, abiSelectors, eventTopics } = useContractMeta(callTreeAddresses);
  const { data: signatureMap = {} } = useSignatures(callTreeSelectors);

  // Frame → entry-step mapping (lifted here so per-contract source maps can be
  // computed once and shared with the call tree).
  const frameStepMap = useMemo(
    () => (callTrace ? mapFramesToSteps(callTrace, steps) : new Map<CallFrame, number>()),
    [callTrace, steps],
  );

  // Source maps for EVERY contract in the trace, so the call tree can trace
  // internal functions across all of them (Remix's model), not just the active
  // contract. Keyed by the pcs each contract actually executed.
  const pcsByContract = useMemo(
    () => (callTrace ? computePcsByContract(callTrace, frameStepMap, steps) : {}),
    [callTrace, frameStepMap, steps],
  );
  const { data: traceSourceMaps = {} } = useTraceSourceMaps(pcsByContract);

  // Decoded events keyed by the LOG opcode's step, so the call tree can show
  // each emitted event nested in the function that fired it.
  const logsByStep = useMemo(
    () => buildLogsByStep(steps, rawLogs ?? [], eventTopics, decodedLogs ?? []),
    [steps, rawLogs, eventTopics, decodedLogs],
  );

  const uniquePcs = useMemo(() => [...new Set(steps.map((s) => s.pc))], [steps]);

  // ---- Navigation ----
  // useOpcodeNavigation owns the cursor + traversal primitives. These wrappers
  // add the web-specific side effect of clearing `overrideLine` (manual
  // source-line override from func-search) on every navigation event.
  const goTo = nav.jumpTo;

  const stepForward = useCallback(() => { setOverrideLine(null); nav.goForward(); }, [nav]);
  const stepBackward = useCallback(() => { setOverrideLine(null); nav.goBack(); }, [nav]);

  // Jump to a step from the call tree. The debugger split shows source AND
  // the opcode trace, so the click always visibly navigates: the opcode pane
  // auto-scrolls to the step even when there's no verified source, and the
  // source pane scrolls to the function when one exists. A funcName is only
  // passed for value transfers (receive/fallback), whose unmapped bodies need
  // the text search; the pending-search effect waits for source to load.
  const jumpToAndShowSource = useCallback(
    (step: number, funcName?: string) => {
      // Always drop any prior text-search override. Function/dispatch rows let
      // the source map drive the line, so a leftover override from an earlier
      // receive/fallback click would otherwise stick and send every later click
      // to the stale line.
      setOverrideLine(null);
      goTo(step);
      setContentView("debugger");
      setScrollKey((k) => k + 1);
      if (funcName) setPendingFuncSearch(funcName);
    },
    [goTo],
  );

  const jumpToNext = useCallback(
    (predicate: (op: string) => boolean): void => {
      setOverrideLine(null);
      nav.jumpToNext(predicate);
    },
    [nav],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // When the call tree has focus, it owns the arrow/enter keys (expand /
      // collapse / move). Don't also scrub the trace from underneath it.
      if (e.target instanceof HTMLElement && e.target.closest("[data-debugger-tree]")) return;
      switch (e.key) {
        case "ArrowRight":
        case " ":
          e.preventDefault(); stepForward(); break;
        case "ArrowLeft":
          e.preventDefault(); stepBackward(); break;
        case "Home":
          e.preventDefault(); goTo(0); break;
        case "End":
          e.preventDefault(); goTo(totalSteps - 1); break;
        case "c": case "C":
          e.preventDefault(); jumpToNext(isCallOp); break;
        case "s": case "S":
          e.preventDefault(); jumpToNext(isStorageOp); break;
        case "l": case "L":
          e.preventDefault(); jumpToNext(isLogOp); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stepForward, stepBackward, goTo, totalSteps, jumpToNext]);

  const step = steps[currentStep];

  // Stack diff: compare from TOS so PUSH/POP/DUP/SWAP highlight correctly.
  // Stack values come from the lazily-loaded detail, not the skeleton step.
  const stackChanges = useMemo(() => {
    if (!currentDetail || !prevDetail) return new Set<number>();
    const changes = new Set<number>();
    const curr = currentDetail.stack;
    const prev = prevDetail.stack;
    const maxLen = Math.max(curr.length, prev.length);
    for (let i = 0; i < maxLen; i++) {
      const currIdx = curr.length - 1 - i;
      const prevIdx = prev.length - 1 - i;
      const currVal = currIdx >= 0 ? curr[currIdx] : undefined;
      const prevVal = prevIdx >= 0 ? prev[prevIdx] : undefined;
      if (currVal !== prevVal && currIdx >= 0) changes.add(currIdx);
    }
    return changes;
  }, [currentDetail, prevDetail]);

  // What the current opcode operates on — its stack inputs (consumed slots),
  // output count, and the memory region / storage slot it touches. Pre-stack
  // is the lazily-loaded detail's stack (geth reports it before the op runs).
  const operands = useMemo(
    () => (step && currentDetail ? describeOperands(step.op, currentDetail.stack) : null),
    [step, currentDetail],
  );
  const inputIndices = useMemo(
    () => new Set(operands?.inputIndices ?? []),
    [operands],
  );

  const onExpandFrame = useCallback(
    (frame: CallFrame, entryStep: number, label: string) =>
      setExpandedFrame({ frame, from: entryStep, label }),
    [],
  );

  // The expanded frame's opcode slice runs from its entry until execution
  // returns above its depth (so nested sub-calls are included, indented).
  const expandedRange = useMemo(() => {
    if (!expandedFrame) return null;
    const from = expandedFrame.from;
    const baseDepth = steps[from]?.depth ?? 1;
    let to = steps.length;
    for (let i = from + 1; i < steps.length; i++) {
      if (steps[i]!.depth < baseDepth) { to = i; break; }
    }
    return { from, to };
  }, [expandedFrame, steps]);

  const storageDiff = useMemo<StorageDiff[]>(() => {
    if (!currentDetail) return [];
    const curr: Record<string, string> = currentDetail.storage;
    const prev: Record<string, string> = prevDetail?.storage ?? {};
    const diffs: StorageDiff[] = [];
    for (const [slot, value] of Object.entries(curr)) {
      if (prev[slot] !== value) {
        diffs.push({ slot, oldValue: prev[slot] ?? null, newValue: value });
      }
    }
    return diffs;
  }, [currentDetail, prevDetail]);

  // Step ranges of every frame that actually ran code, from the same
  // frameStepMap the call tree uses. The previous approach counted CALL-family
  // opcodes and paired them with the flattened tree in order; a codeless callee
  // (EOA / precompile) or any call whose op/frame ordering didn't line up threw
  // the count off by one and every later step resolved to the wrong contract
  // ("fine until WPLS.balanceOf, then downhill"). Depth-bounded ranges don't
  // drift: a frame owns [entry, end) where end is the first shallower step.
  const frameRanges = useMemo(() => {
    if (!callTrace) return [] as Array<{ addr: string | null; entry: number; end: number; depth: number }>;
    const out: Array<{ addr: string | null; entry: number; end: number; depth: number }> = [];
    const visit = (frame: CallFrame, parentDepth: number) => {
      const entry = frameStepMap.get(frame);
      if (entry === undefined) return;
      const depth = steps[entry]?.depth ?? parentDepth + 1;
      // A frame "ran code" only if it executed at a deeper depth than its
      // parent; a codeless callee is mapped to the parent-depth CALL op and is
      // skipped so it can't masquerade as the active contract.
      const ranCode = depth > parentDepth;
      if (ranCode) {
        let end = steps.length;
        for (let i = entry + 1; i < steps.length; i++) {
          if (steps[i]!.depth < depth) { end = i; break; }
        }
        out.push({ addr: frame.to ?? null, entry, end, depth });
        for (const c of frame.calls ?? []) visit(c, depth);
      } else {
        for (const c of frame.calls ?? []) visit(c, parentDepth);
      }
    };
    visit(callTrace, 0);
    return out;
  }, [callTrace, frameStepMap, steps]);

  // The contract executing at the cursor = the deepest frame whose range covers
  // the current step. For DELEGATECALL the frame's `to` is the code contract,
  // which is exactly the source we want to show.
  const activeContractAddress = useMemo(() => {
    let best: string | null = null;
    let bestDepth = -1;
    for (const f of frameRanges) {
      if (f.entry <= currentStep && currentStep < f.end && f.depth > bestDepth) {
        bestDepth = f.depth;
        best = f.addr;
      }
    }
    return best ?? callTrace?.to ?? contractAddress ?? null;
  }, [frameRanges, currentStep, callTrace, contractAddress]);

  const { data: sourceData = null, isLoading: sourceLoading } = useContractSource(activeContractAddress);

  const { data: sourceMappings = {} } = useSourceMappings(
    sourceData?.hasSourceMap ? activeContractAddress : null,
    uniquePcs,
  );

  // Resolve a pending function-name search → line number when source loads.
  // If not found in the active source (e.g. proxy contract), search all files;
  // prefer matches inside contract{}/library{} over interface{}.
  useEffect(() => {
    if (!pendingFuncSearch || !sourceData) return;

    // Solidity's special members (`receive() external payable`,
    // `fallback() …`) are declared without the `function` keyword, so a
    // `function NAME(` pattern would never match and we'd latch onto a stray
    // token elsewhere. Match those by their own header form.
    const isSpecial = pendingFuncSearch === "receive" || pendingFuncSearch === "fallback";
    const funcPattern = isSpecial
      ? new RegExp(`\\b${pendingFuncSearch}\\s*\\(\\s*\\)`)
      : new RegExp(`function\\s+${pendingFuncSearch}\\s*\\(`);
    const varPattern = new RegExp(`\\b${pendingFuncSearch}\\b`);

    for (const file of sourceData.files ?? []) {
      const lines = file.content.split("\n");

      let inInterface = false;
      let inContract = false;
      let braceDepth = 0;
      let interfaceMatch: number | null = null;
      let contractMatch: number | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;

        if (/\binterface\s+\w+/.test(line)) inInterface = true;
        if (/\bcontract\s+\w+/.test(line) || /\blibrary\s+\w+/.test(line)) {
          inContract = true; inInterface = false;
        }

        for (const ch of line) {
          if (ch === "{") braceDepth++;
          if (ch === "}") {
            braceDepth--;
            if (braceDepth === 0) { inInterface = false; inContract = false; }
          }
        }

        if (funcPattern.test(line)) {
          if (inContract && !inInterface) {
            contractMatch = i + 1;
          } else if (inInterface && interfaceMatch === null) {
            interfaceMatch = i + 1;
          } else if (contractMatch === null && interfaceMatch === null) {
            contractMatch = i + 1;
          }
        }

        if (varPattern.test(line) && /\bpublic\b/.test(line) && !/^\s*\/\//.test(line)) {
          if (inContract && contractMatch === null) contractMatch = i + 1;
        }
      }

      const bestMatch = contractMatch ?? interfaceMatch;
      if (bestMatch !== null) {
        setOverrideLine(bestMatch);
        setScrollKey((k) => k + 1);
        setPendingFuncSearch(null);
        return;
      }
    }

    setPendingFuncSearch(null);
  }, [pendingFuncSearch, sourceData]);

  const currentSourceLocation = step ? sourceMappings[step.pc] ?? null : null;
  const currentSourceFile = sourceData
    ? currentSourceLocation
      ? sourceData.files.find((f) => f.name === currentSourceLocation.file) ?? sourceData.files[0] ?? null
      : sourceData.files[0] ?? null
    : null;

  const effectiveLine = overrideLine ?? currentSourceLocation?.line ?? null;

  // Exact sub-expression highlight from the source map. Suppressed when a
  // manual func-search override is active (those carry only a line), when the
  // mapped location is for a different file than the one shown, or when the
  // span is so large (a JUMPDEST mapping to a whole function/contract body)
  // that boxing it would just paint the screen — there the line accent is
  // clearer. The MAX_SPAN_LINES cap is the threshold for "still a sub-expr".
  const MAX_SPAN_LINES = 4;
  const highlightSpan =
    overrideLine === null &&
    currentSourceLocation !== null &&
    currentSourceFile !== null &&
    currentSourceLocation.file === currentSourceFile.name &&
    currentSourceLocation.endLine - currentSourceLocation.line < MAX_SPAN_LINES
      ? {
          startLine: currentSourceLocation.line,
          startCol: currentSourceLocation.column,
          endLine: currentSourceLocation.endLine,
          endCol: currentSourceLocation.endColumn,
        }
      : null;

  // ---- Dev nav instrumentation (stripped from prod bundles) ----
  // Publishes the step→contract→source-map resolver and the built tree on
  // window.__traceNav, so a headless check can verify, for any tree node, that
  // its jump target resolves to the source location it should. Pure derived
  // data — no click-time bookkeeping.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    publishNavContext({ steps, frameRanges, traceSourceMaps });
  }, [steps, frameRanges, traceSourceMaps]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    publishNavState({
      currentStep,
      activeContract: activeContractAddress,
      file: currentSourceFile?.name ?? null,
      effectiveLine,
    });
  }, [currentStep, activeContractAddress, currentSourceFile, effectiveLine]);

  // Reverse link: which source lines have an opcode (so their gutter is a
  // clickable jump target), and the first step that lands on each line. Built
  // for the file currently shown so clicking a line jumps execution there.
  const { executableLines, lineToFirstStep } = useMemo(() => {
    const lines = new Set<number>();
    const firstStep = new Map<number, number>();
    if (!currentSourceFile) return { executableLines: lines, lineToFirstStep: firstStep };
    for (let i = 0; i < steps.length; i++) {
      const loc = sourceMappings[steps[i]!.pc];
      if (loc && loc.file === currentSourceFile.name) {
        lines.add(loc.line);
        if (!firstStep.has(loc.line)) firstStep.set(loc.line, i);
      }
    }
    return { executableLines: lines, lineToFirstStep: firstStep };
  }, [steps, sourceMappings, currentSourceFile]);

  const jumpToLine = useCallback(
    (line: number) => {
      const idx = lineToFirstStep.get(line);
      if (idx !== undefined) {
        setOverrideLine(null);
        goTo(idx);
      }
    },
    [lineToFirstStep, goTo],
  );

  // All hooks are above this point; the early return is safe here (the cursor
  // is always in range once there are steps, but guard for the empty trace).
  if (!step) return null;

  const callTreeProps = {
    steps, onJumpTo: jumpToAndShowSource, signatureMap, frameStepMap,
    traceSourceMaps, callTrace, contractNames, abiSelectors, logsByStep,
    treeStateKey: txHash, onExpandFrame,
  };

  return (
    <div className="flex flex-col gap-0">
      <ControlsBar
        currentStep={currentStep}
        totalSteps={totalSteps}
        goTo={goTo}
        stepForward={stepForward}
        stepBackward={stepBackward}
        jumpToNext={jumpToNext}
        opcodeFilter={opcodeFilter}
        setOpcodeFilter={setOpcodeFilter}
        filteredCount={filteredIndices?.length ?? null}
        contractAddress={contractAddress}
        contentView={contentView}
        setContentView={setContentView}
        sourceLoading={sourceLoading}
        handleAnalyze={handleAnalyze}
        slitherLoading={slitherLoading}
        showFindings={showFindings}
        slitherFindingsCount={slitherFindings.length}
      />

      <CallContextBreadcrumb step={step} currentSourceLocation={currentSourceLocation} />

      {showFindings && slitherFindings.length > 0 && (
        <FindingsPanel findings={slitherFindings} />
      )}

      <div className="flex flex-col lg:flex-row gap-0" style={{ minHeight: "500px" }}>
        {/* Tree column stretches to the content column's height (no dead space
            below it) while staying sticky and capped to the viewport so it
            remains a self-contained, scrollable pane as you move down the page. */}
        <div className="hidden lg:flex sticky top-0 self-stretch" style={{ maxHeight: "100vh" }}>
          <ResizablePanel width={treeWidth} onResize={handleTreeResize} height="100%">
            <CallTreeFromOpcodes {...callTreeProps} />
          </ResizablePanel>
        </div>
        <div className="lg:hidden">
          <CollapsiblePanel title="Call Tree" count={steps.length} suffix="ops" defaultOpen={false}>
            <div style={{ maxHeight: "250px" }} className="overflow-y-auto">
              <CallTreeFromOpcodes {...callTreeProps} inline />
            </div>
          </CollapsiblePanel>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-0">
          <div className="flex" style={{ boxShadow: "0 1px 0 0 var(--color-border-default)" }}>
            {(["debugger", "trace"] as const).map((view) => (
              <button
                key={view}
                onClick={() => setContentView(view)}
                className="px-4 py-2 text-xs font-medium transition-colors"
                style={{
                  boxShadow:
                    contentView === view
                      ? "0 2px 0 0 var(--color-accent)"
                      : "0 2px 0 0 transparent",
                  color: contentView === view ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  backgroundColor: "transparent",
                }}
              >
                {view === "debugger" ? "Source + Opcodes" : "Decoded Trace"}
              </button>
            ))}
          </div>

          {contentView === "trace" && (
            <DecodedTrace
              steps={steps}
              currentStep={currentStep}
              signatureMap={signatureMap}
              sourceMappings={sourceMappings}
              callTrace={callTrace}
              contractNames={contractNames}
              onJumpTo={jumpToAndShowSource}
            />
          )}

          {contentView === "debugger" && (
            <SourceOpcodeSplit
              currentSourceFile={currentSourceFile}
              effectiveLine={effectiveLine}
              highlightSpan={highlightSpan}
              scrollKey={scrollKey}
              slitherFindings={slitherFindings}
              sourceLoading={sourceLoading}
              activeContractAddress={activeContractAddress}
              executableLines={executableLines}
              onJumpToLine={jumpToLine}
              steps={steps}
              currentStep={currentStep}
              goTo={goTo}
              filteredIndices={filteredIndices}
              maxDepth={maxDepth}
              opcodeFreqs={opcodeFreqs}
              opcodeFilter={opcodeFilter}
              onToggleOpcode={toggleOpcode}
            />
          )}

          <OperandBar op={step.op} operands={operands} />
          <StoragePanel
            diffs={storageDiff}
            currentOp={step.op}
            loading={detailLoading}
            highlightSlot={operands?.storageSlot ?? null}
          />
          <StackPanel
            stack={currentDetail?.stack ?? []}
            changedIndices={stackChanges}
            inputIndices={inputIndices}
            loading={detailLoading}
          />
          <MemoryPanel
            memory={currentDetail?.memory ?? []}
            loading={detailLoading}
            highlight={operands?.memory ?? null}
          />
        </div>
      </div>

      <ShortcutsHelp />

      {expandedFrame && expandedRange && (
        <FrameOpcodesOverlay
          steps={steps}
          from={expandedRange.from}
          to={expandedRange.to}
          label={expandedFrame.label}
          frameType={expandedFrame.frame.type}
          currentStep={currentStep}
          onJumpTo={(s) => { goTo(s); setContentView("debugger"); setScrollKey((k) => k + 1); }}
          onClose={() => setExpandedFrame(null)}
        />
      )}
    </div>
  );
}
