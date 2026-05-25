import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  isCallOp,
  isStorageOp,
  isLogOp,
  useOpcodeNavigation,
} from "@valve-tech/trace-sdk/hooks";
import type { OpcodeStep, CallFrame } from "../../api/debugger";
import { analyzeContract, type SlitherFinding } from "../../api/source";
import { useContractSource, useSourceMappings } from "../../hooks/useContractSource";
import { useContractNames } from "../../hooks/useContractNames";
import { useSignatures } from "../../hooks/useSignatures";
import FindingsPanel from "./SlitherFindingsPanel";
import { flattenCallTree, walkCallTree } from "./StepDebugger/callTreeHelpers";
import { CollapsiblePanel } from "./StepDebugger/CollapsiblePanel";
import { ControlsBar } from "./StepDebugger/ControlsBar";
import { CallContextBreadcrumb } from "./StepDebugger/CallContextBreadcrumb";
import { CallTreeFromOpcodes } from "./StepDebugger/CallTreeFromOpcodes";
import { DecodedTrace } from "./StepDebugger/DecodedTrace";
import { OpcodesTraceView } from "./StepDebugger/OpcodesTraceView";
import { OpcodeFrequencyTags } from "./StepDebugger/OpcodeFrequencyTags";
import { opcodeFrequencies } from "./StepDebugger/opcodeStats";
import { SourceTabContent } from "./StepDebugger/SourceTabContent";
import { StoragePanel, type StorageDiff } from "./StepDebugger/StoragePanel";
import { StackPanel } from "./StepDebugger/StackPanel";
import { MemoryPanel } from "./StepDebugger/MemoryPanel";
import { ShortcutsHelp } from "./StepDebugger/ShortcutsHelp";

interface StepDebuggerProps {
  steps: OpcodeStep[];
  contractAddress?: string;
  callTrace?: CallFrame | null;
}

export default function StepDebugger({ steps, contractAddress, callTrace }: StepDebuggerProps) {
  const nav = useOpcodeNavigation(steps);
  const { currentIndex: currentStep, totalSteps } = nav;

  const [opcodeFilter, setOpcodeFilter] = useState("");
  const [contentView, setContentView] = useState<"trace" | "opcodes" | "source">("source");
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
    setContentView("source");
  }, [steps]);

  const handleAnalyze = useCallback(async () => {
    if (!contractAddress || slitherLoading) return;
    setSlitherLoading(true);
    try {
      const res = await analyzeContract(contractAddress);
      if (res.ok && res.analysis) {
        setSlitherFindings(res.analysis.findings);
        setShowFindings(true);
        setContentView("source");
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

  const { data: contractNames = {} } = useContractNames(callTreeAddresses);
  const { data: signatureMap = {} } = useSignatures(callTreeSelectors);

  const uniquePcs = useMemo(() => [...new Set(steps.map((s) => s.pc))], [steps]);

  // ---- Navigation ----
  // useOpcodeNavigation owns the cursor + traversal primitives. These wrappers
  // add the web-specific side effect of clearing `overrideLine` (manual
  // source-line override from func-search) on every navigation event.
  const goTo = nav.jumpTo;

  const stepForward = useCallback(() => { setOverrideLine(null); nav.goForward(); }, [nav]);
  const stepBackward = useCallback(() => { setOverrideLine(null); nav.goBack(); }, [nav]);

  // Tracks whether verified source is available, so a call-tree click can pick
  // a view that actually shows movement. Updated by an effect once source loads.
  const hasSourceRef = useRef(false);

  // Jump to a step from the call tree. When verified source exists, switch to
  // Source and scroll to the function; otherwise switch to the Opcodes trace
  // (which auto-scrolls to the step) so the click always visibly navigates.
  const jumpToAndShowSource = useCallback(
    (step: number, funcName?: string) => {
      goTo(step);
      if (hasSourceRef.current) {
        setContentView("source");
        setScrollKey((k) => k + 1);
        if (funcName) setPendingFuncSearch(funcName);
      } else {
        setContentView("opcodes");
      }
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
  const prevStep = currentStep > 0 ? steps[currentStep - 1] : null;

  // Stack diff: compare from TOS so PUSH/POP/DUP/SWAP highlight correctly.
  const stackChanges = useMemo(() => {
    if (!step || !prevStep) return new Set<number>();
    const changes = new Set<number>();
    const curr = step.stack;
    const prev = prevStep.stack;
    const maxLen = Math.max(curr.length, prev.length);
    for (let i = 0; i < maxLen; i++) {
      const currIdx = curr.length - 1 - i;
      const prevIdx = prev.length - 1 - i;
      const currVal = currIdx >= 0 ? curr[currIdx] : undefined;
      const prevVal = prevIdx >= 0 ? prev[prevIdx] : undefined;
      if (currVal !== prevVal && currIdx >= 0) changes.add(currIdx);
    }
    return changes;
  }, [step, prevStep]);

  const storageDiff = useMemo<StorageDiff[]>(() => {
    if (!step) return [];
    const curr: Record<string, string> = step.storage;
    const prev: Record<string, string> = prevStep?.storage ?? {};
    const diffs: StorageDiff[] = [];
    for (const [slot, value] of Object.entries(curr)) {
      if (prev[slot] !== value) {
        diffs.push({ slot, oldValue: prev[slot] ?? null, newValue: value });
      }
    }
    return diffs;
  }, [step, prevStep]);

  // Which contract is executing at the current step? Walk the call tree by
  // depth: each CALL pushes its target, each depth-decrease pops back.
  const activeContractAddress = useMemo(() => {
    if (!callTrace) return contractAddress ?? null;
    const flatCalls = flattenCallTree(callTrace);
    let callIdx = 0;
    let currentAddr: string | null = callTrace.to ?? contractAddress ?? null;
    const addrStack: Array<string | null> = [currentAddr];

    for (let i = 0; i <= currentStep && i < steps.length; i++) {
      const s = steps[i]!;
      if (isCallOp(s.op) && callIdx < flatCalls.length) {
        const target = flatCalls[callIdx]!.to;
        callIdx++;
        addrStack.push(target || currentAddr);
        currentAddr = target || currentAddr;
      } else if (i > 0 && s.depth < steps[i - 1]!.depth) {
        addrStack.pop();
        currentAddr = addrStack[addrStack.length - 1] ?? contractAddress ?? null;
      }
    }
    return currentAddr;
  }, [callTrace, contractAddress, currentStep, steps]);

  const { data: sourceData = null, isLoading: sourceLoading } = useContractSource(activeContractAddress);

  useEffect(() => {
    hasSourceRef.current = sourceData != null;
  }, [sourceData]);
  const { data: sourceMappings = {} } = useSourceMappings(
    sourceData?.hasSourceMap ? activeContractAddress : null,
    uniquePcs,
  );

  // Resolve a pending function-name search → line number when source loads.
  // If not found in the active source (e.g. proxy contract), search all files;
  // prefer matches inside contract{}/library{} over interface{}.
  useEffect(() => {
    if (!pendingFuncSearch || !sourceData) return;

    const funcPattern = new RegExp(`function\\s+${pendingFuncSearch}\\s*\\(`);
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

  if (!step) return null;

  const currentSourceLocation = sourceMappings[step.pc] ?? null;
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

  const callTreeProps = {
    steps, onJumpTo: jumpToAndShowSource, signatureMap, sourceMappings,
    sourceData, callTrace, contractNames,
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
        <div className="hidden lg:block w-[280px] flex-shrink-0 sticky top-0 self-start" style={{ height: "calc(100vh - 200px)" }}>
          <CallTreeFromOpcodes {...callTreeProps} />
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
            {(["trace", "opcodes", "source"] as const).map((view) => (
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
                {view === "trace" ? "Decoded Trace" : view === "opcodes" ? "Opcodes" : "Source"}
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

          {contentView === "opcodes" && (
            <>
              <OpcodeFrequencyTags
                frequencies={opcodeFreqs}
                activeOp={opcodeFilter}
                onToggle={toggleOpcode}
              />
              <OpcodesTraceView
                steps={steps}
                currentStep={currentStep}
                goTo={goTo}
                filteredIndices={filteredIndices}
                maxDepth={maxDepth}
              />
            </>
          )}

          {contentView === "source" && (
            <SourceTabContent
              currentSourceFile={currentSourceFile}
              effectiveLine={effectiveLine}
              highlightSpan={highlightSpan}
              scrollKey={scrollKey}
              slitherFindings={slitherFindings}
              sourceLoading={sourceLoading}
              activeContractAddress={activeContractAddress}
            />
          )}

          <StoragePanel diffs={storageDiff} currentOp={step.op} />
          <StackPanel stack={step.stack} changedIndices={stackChanges} />
          <MemoryPanel memory={step.memory} />
        </div>
      </div>

      <ShortcutsHelp />
    </div>
  );
}
