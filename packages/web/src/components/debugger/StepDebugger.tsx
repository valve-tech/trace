import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { OpcodeStep, CallFrame } from "../../api/debugger";
import { analyzeContract, type SourceLocation, type SlitherFinding } from "../../api/source";
import type { SignatureMatch } from "../../api/signatures";
import { useContractSource, useSourceMappings } from "../../hooks/useContractSource";
import { useContractNames } from "../../hooks/useContractNames";
import { useSignatures } from "../../hooks/useSignatures";
import { lookupWellKnown } from "../../lib/wellKnownSignatures";
import SourceViewer from "./SourceViewer";
import FindingsPanel from "./FindingsPanel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VISIBLE_ROWS = 30;

const OPCODE_COLORS: Record<string, string> = {
  // Stack
  PUSH: "#60A5FA", POP: "#60A5FA", DUP: "#60A5FA", SWAP: "#60A5FA",
  // Memory
  MLOAD: "#34D399", MSTORE: "#34D399", MSTORE8: "#34D399", MSIZE: "#34D399",
  // Storage
  SLOAD: "#F59E0B", SSTORE: "#F59E0B", TLOAD: "#F59E0B", TSTORE: "#F59E0B",
  // Calls
  CALL: "#EF4444", DELEGATECALL: "#EF4444", STATICCALL: "#EF4444",
  CREATE: "#EF4444", CREATE2: "#EF4444", CALLCODE: "#EF4444",
  // Logs
  LOG0: "#A78BFA", LOG1: "#A78BFA", LOG2: "#A78BFA", LOG3: "#A78BFA", LOG4: "#A78BFA",
  // Control
  JUMP: "#94A3B8", JUMPI: "#94A3B8", JUMPDEST: "#94A3B8",
  RETURN: "#10B981", REVERT: "#EF4444", STOP: "#10B981",
  SELFDESTRUCT: "#EF4444", INVALID: "#EF4444",
};

function getOpcodeColor(op: string): string {
  if (op.startsWith("PUSH")) return OPCODE_COLORS.PUSH!;
  if (op.startsWith("DUP")) return OPCODE_COLORS.DUP!;
  if (op.startsWith("SWAP")) return OPCODE_COLORS.SWAP!;
  if (op.startsWith("LOG")) return OPCODE_COLORS.LOG0!;
  return OPCODE_COLORS[op] ?? "#94A3B8";
}

function isCallOp(op: string): boolean {
  return ["CALL", "DELEGATECALL", "STATICCALL", "CREATE", "CREATE2", "CALLCODE"].includes(op);
}

function isStorageOp(op: string): boolean {
  return ["SLOAD", "SSTORE", "TLOAD", "TSTORE"].includes(op);
}

function isLogOp(op: string): boolean {
  return op.startsWith("LOG");
}

// ---------------------------------------------------------------------------
// Hex/Memory helpers
// ---------------------------------------------------------------------------

function formatWord(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return "0x" + clean.padStart(64, "0");
}

function truncateWord(hex: string): string {
  const full = formatWord(hex);
  if (full.length <= 18) return full;
  return full.slice(0, 10) + "..." + full.slice(-6);
}

function memoryToBytes(memoryArray: string[]): string {
  return memoryArray.join("");
}

function formatMemoryRow(hex: string, offset: number): { hex: string; ascii: string } {
  const bytes: string[] = [];
  const ascii: string[] = [];
  for (let i = 0; i < 32 && offset * 2 + i * 2 < hex.length; i++) {
    const byteHex = hex.slice(offset * 2 + i * 2, offset * 2 + i * 2 + 2);
    bytes.push(byteHex);
    const code = parseInt(byteHex, 16);
    ascii.push(code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : ".");
  }
  return { hex: bytes.join(" "), ascii: ascii.join("") };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StepDebuggerProps {
  steps: OpcodeStep[];
  contractAddress?: string;
  callTrace?: CallFrame | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StepDebugger({ steps, contractAddress, callTrace }: StepDebuggerProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [opcodeFilter, setOpcodeFilter] = useState("");
  const [contentView, setContentView] = useState<"trace" | "opcodes" | "source">("source");
  const [slitherFindings, setSlitherFindings] = useState<SlitherFinding[]>([]);
  const [slitherLoading, setSlitherLoading] = useState(false);
  const [showFindings, setShowFindings] = useState(false);
  const traceListRef = useRef<HTMLDivElement>(null);
  const rowHeight = 28;

  const totalSteps = steps.length;

  // Compute max depth for depth band colors
  const maxDepth = useMemo(() => {
    let max = 1;
    for (const s of steps) {
      if (s.depth > max) max = s.depth;
    }
    return max;
  }, [steps]);

  // Filtered step indices (when filter is active)
  const filteredIndices = useMemo(() => {
    if (!opcodeFilter) return null;
    const upper = opcodeFilter.toUpperCase();
    const indices: number[] = [];
    for (let i = 0; i < steps.length; i++) {
      if (steps[i]!.op.includes(upper)) indices.push(i);
    }
    return indices;
  }, [opcodeFilter, steps]);

  // Reset step when trace changes (new transaction loaded)
  useEffect(() => {
    setCurrentStep(0);
    setOpcodeFilter("");
    setSlitherFindings([]);
    setShowFindings(false);
    setContentView("source");
  }, [steps]);

  // Contract names and signatures are resolved via TanStack Query hooks above

  // Slither analysis handler
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

  // --- TanStack Query hooks replace all manual fetching ---

  // Extract all unique addresses from the call tree for contract name resolution
  const callTreeAddresses = useMemo(() => {
    if (!callTrace) return [];
    const addrs: string[] = [];
    function walk(f: CallFrame) {
      if (f.to) addrs.push(f.to);
      for (const child of f.calls ?? []) walk(child);
    }
    walk(callTrace);
    return [...new Set(addrs)];
  }, [callTrace]);

  // Extract all unique selectors from the call tree for signature resolution
  const callTreeSelectors = useMemo(() => {
    if (!callTrace) return [];
    const sels = new Set<string>();
    function walk(f: CallFrame) {
      if (f.input && f.input.length >= 10) sels.add(f.input.slice(0, 10).toLowerCase());
      for (const child of f.calls ?? []) walk(child);
    }
    walk(callTrace);
    return [...sels];
  }, [callTrace]);

  const { data: contractNames = {} } = useContractNames(callTreeAddresses);
  const { data: signatureMap = {} } = useSignatures(callTreeSelectors);

  // Unique PCs for source mapping
  const uniquePcs = useMemo(() => [...new Set(steps.map((s) => s.pc))], [steps]);

  // ---- Navigation ----

  const goTo = useCallback(
    (step: number) => {
      setCurrentStep(Math.max(0, Math.min(step, totalSteps - 1)));
    },
    [totalSteps],
  );

  const stepForward = useCallback(() => goTo(currentStep + 1), [currentStep, goTo]);
  const stepBackward = useCallback(() => goTo(currentStep - 1), [currentStep, goTo]);

  // Jump to a step AND switch to source view
  // Jump to a step AND switch to source view.
  // If the target step is a CALL opcode, jump to step+1 (first opcode
  // inside the called function) so the source shows the callee's code.
  const jumpToAndShowSource = useCallback(
    (step: number) => {
      const targetStep = steps[step];
      if (targetStep && isCallOp(targetStep.op) && step + 1 < steps.length) {
        goTo(step + 1);
      } else {
        goTo(step);
      }
      setContentView("source");
    },
    [goTo, steps],
  );

  const jumpToNext = useCallback(
    (predicate: (op: string) => boolean) => {
      for (let i = currentStep + 1; i < totalSteps; i++) {
        if (predicate(steps[i]!.op)) {
          goTo(i);
          return;
        }
      }
    },
    [currentStep, totalSteps, steps, goTo],
  );

  // ---- Keyboard shortcuts ----

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case "ArrowRight":
        case " ":
          e.preventDefault();
          stepForward();
          break;
        case "ArrowLeft":
          e.preventDefault();
          stepBackward();
          break;
        case "Home":
          e.preventDefault();
          goTo(0);
          break;
        case "End":
          e.preventDefault();
          goTo(totalSteps - 1);
          break;
        case "c":
        case "C":
          e.preventDefault();
          jumpToNext(isCallOp);
          break;
        case "s":
        case "S":
          e.preventDefault();
          jumpToNext(isStorageOp);
          break;
        case "l":
        case "L":
          e.preventDefault();
          jumpToNext(isLogOp);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stepForward, stepBackward, goTo, totalSteps, jumpToNext]);

  // ---- Auto-scroll trace list ----

  useEffect(() => {
    if (!traceListRef.current) return;
    const container = traceListRef.current;
    const targetScroll = currentStep * rowHeight - container.clientHeight / 2 + rowHeight / 2;
    container.scrollTop = Math.max(0, targetScroll);
  }, [currentStep]);

  // ---- Current step data ----

  const step = steps[currentStep];
  const prevStep = currentStep > 0 ? steps[currentStep - 1] : null;

  // ---- Stack diff ----

  // Compare stacks from the top (TOS) to correctly highlight after PUSH/POP/DUP/SWAP
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
      if (currVal !== prevVal && currIdx >= 0) {
        changes.add(currIdx);
      }
    }
    return changes;
  }, [step, prevStep]);

  // ---- Storage diff ----

  const storageDiff = useMemo(() => {
    if (!step) return [];
    const curr = step.storage;
    const prev = prevStep?.storage ?? {};
    const diffs: Array<{ slot: string; oldValue: string | null; newValue: string }> = [];

    for (const [slot, value] of Object.entries(curr)) {
      if (prev[slot] !== value) {
        diffs.push({ slot, oldValue: prev[slot] ?? null, newValue: value });
      }
    }
    return diffs;
  }, [step, prevStep]);

  // ---- Virtual scrolling for trace list ----

  const [scrollTop, setScrollTop] = useState(0);
  const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - 5);
  const visibleEnd = Math.min(totalSteps, visibleStart + VISIBLE_ROWS + 10);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  if (!step) return null;

  // ---- Memory ----

  const memoryHex = memoryToBytes(step.memory);
  const memorySize = memoryHex.length / 2;
  const memoryRows = Math.min(Math.ceil(memorySize / 16), 64); // Cap at 1KB display

  // ---- Current source location ----

  // Determine which contract the current step is executing in
  // by matching the step's depth to the call tree
  const activeContractAddress = useMemo(() => {
    if (!callTrace) return contractAddress ?? null;
    // Build a depth→address map from the opcode trace
    // When we see a CALL at step N going to depth D+1, the address at D+1
    // is the call tree child's `to` address
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

  // Source data and mappings via TanStack Query — cached automatically
  const { data: sourceData = null, isLoading: sourceLoading } = useContractSource(activeContractAddress);
  const { data: sourceMappings = {} } = useSourceMappings(
    sourceData?.hasSourceMap ? activeContractAddress : null,
    uniquePcs,
  );

  const currentSourceLocation = sourceMappings[step.pc] ?? null;
  const currentSourceFile = sourceData
    ? currentSourceLocation
      ? sourceData.files.find((f) => f.name === currentSourceLocation.file) ?? sourceData.files[0] ?? null
      : sourceData.files[0] ?? null
    : null;

  return (
    <div className="flex flex-col gap-0">
      {/* Controls bar */}
      <div
        className="flex items-center gap-3 px-4 py-2 card"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
        }}
      >
        <div className="flex items-center gap-1">
          <ControlButton label="|<" title="Jump to start (Home)" onClick={() => goTo(0)} />
          <ControlButton label="<" title="Step back (Left arrow)" onClick={stepBackward} />
          <ControlButton label=">" title="Step forward (Right arrow / Space)" onClick={stepForward} />
          <ControlButton label=">|" title="Jump to end (End)" onClick={() => goTo(totalSteps - 1)} />
        </div>

        <div
          className="h-4 w-px"
          style={{ backgroundColor: "var(--color-border-default)" }}
        />

        <div className="flex items-center gap-1">
          <ControlButton label="CALL" title="Next CALL (C)" onClick={() => jumpToNext(isCallOp)} small accent />
          <ControlButton label="SSTORE" title="Next SSTORE (S)" onClick={() => jumpToNext(isStorageOp)} small accent />
          <ControlButton label="LOG" title="Next LOG (L)" onClick={() => jumpToNext(isLogOp)} small accent />
        </div>

        <div
          className="h-4 w-px"
          style={{ backgroundColor: "var(--color-border-default)" }}
        />

        {/* Opcode filter */}
        <input
          type="text"
          placeholder="Filter..."
          value={opcodeFilter}
          onChange={(e) => setOpcodeFilter(e.target.value)}
          className="w-24 px-2 py-1 rounded text-xs border"
          style={{
            backgroundColor: "var(--color-bg-input)",
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
          }}
        />
        {filteredIndices && (
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {filteredIndices.length} matches
          </span>
        )}

        {contractAddress && (
          <>
            <div
              className="h-4 w-px"
              style={{ backgroundColor: "var(--color-border-default)" }}
            />
            <button
              onClick={() => setContentView("source")}
              className="rounded font-mono font-semibold transition-colors text-xs px-2 py-1"
              style={{
                backgroundColor: contentView === "source"
                  ? "var(--color-accent)"
                  : "var(--color-bg-secondary)",
                color: contentView === "source" ? "#fff" : "var(--color-text-primary)",
              }}
            >
              {sourceLoading ? "Loading..." : "Source"}
            </button>
            <button
              onClick={handleAnalyze}
              disabled={slitherLoading}
              className="rounded font-mono font-semibold transition-colors text-xs px-2 py-1"
              style={{
                backgroundColor: showFindings
                  ? "var(--color-danger)"
                  : "var(--color-bg-secondary)",
                color: showFindings ? "#fff" : "var(--color-text-primary)",
                border: "1px solid var(--color-border-default)",
                opacity: slitherLoading ? 0.5 : 1,
              }}
            >
              {slitherLoading ? "Analyzing..." : `Slither${slitherFindings.length > 0 ? ` (${slitherFindings.length})` : ""}`}
            </button>
          </>
        )}

        <div
          className="h-4 w-px"
          style={{ backgroundColor: "var(--color-border-default)" }}
        />

        {/* Slider */}
        <input
          type="range"
          min={0}
          max={totalSteps - 1}
          value={currentStep}
          onChange={(e) => goTo(Number(e.target.value))}
          className="flex-1"
          style={{ accentColor: "var(--color-accent)" }}
        />

        <span
          className="text-xs whitespace-nowrap"
          style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}
        >
          {(currentStep + 1).toLocaleString()} / {totalSteps.toLocaleString()}
        </span>
      </div>

      {/* Call context breadcrumb */}
      <div
        className="px-4 py-2 card text-xs flex items-center gap-1 overflow-x-auto"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
          fontFamily: "var(--font-mono)",
          color: "var(--color-text-secondary)",
        }}
      >
        <span style={{ color: "var(--color-text-muted)" }}>Depth:</span>
        <span style={{ color: "var(--color-accent)" }}>{step.depth}</span>
        <span style={{ color: "var(--color-text-muted)" }}>|</span>
        <span style={{ color: "var(--color-text-muted)" }}>PC:</span>
        <span>{step.pc}</span>
        <span style={{ color: "var(--color-text-muted)" }}>|</span>
        <span style={{ color: getOpcodeColor(step.op), fontWeight: 600 }}>{step.op}</span>
        <span style={{ color: "var(--color-text-muted)" }}>|</span>
        <span style={{ color: "var(--color-text-muted)" }}>Gas:</span>
        <span>{step.gas.toLocaleString()}</span>
        <span style={{ color: "var(--color-warning)" }}>(-{step.gasCost})</span>
        {currentSourceLocation && (
          <>
            <span style={{ color: "var(--color-text-muted)" }}>|</span>
            <span style={{ color: "var(--color-success)" }}>
              {currentSourceLocation.file}:{currentSourceLocation.line}
            </span>
          </>
        )}
      </div>

      {/* Slither findings panel */}
      {showFindings && slitherFindings.length > 0 && (
        <FindingsPanel findings={slitherFindings} />
      )}

      {/* Main layout: Call tree sidebar + content */}
      <div className="flex flex-col lg:flex-row gap-0" style={{ minHeight: "500px" }}>

        {/* Left sidebar: Call Tree */}
        <div className="hidden lg:block w-[280px] flex-shrink-0">
          <CallTreeFromOpcodes steps={steps} currentStep={currentStep} onJumpTo={jumpToAndShowSource} signatureMap={signatureMap} sourceMappings={sourceMappings} callTrace={callTrace} />
        </div>
        <div className="lg:hidden">
          <CollapsiblePanel title="Call Tree" count={steps.length} suffix="ops" defaultOpen={false}>
            <div style={{ maxHeight: "250px" }} className="overflow-y-auto">
              <CallTreeFromOpcodes steps={steps} currentStep={currentStep} onJumpTo={jumpToAndShowSource} signatureMap={signatureMap} sourceMappings={sourceMappings} callTrace={callTrace} inline />
            </div>
          </CollapsiblePanel>
        </div>

        {/* Right: Tabbed content + Storage */}
        <div className="flex-1 min-w-0 flex flex-col gap-0">

      {/* Content view tabs */}
      <div
        className="flex border-b"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        {(["trace", "opcodes", "source"] as const).map((view) => (
          <button
            key={view}
            onClick={() => setContentView(view)}
            className="px-4 py-2 text-xs font-medium border-b-2 transition-colors"
            style={{
              borderColor: contentView === view ? "var(--color-accent)" : "transparent",
              color: contentView === view ? "var(--color-text-primary)" : "var(--color-text-muted)",
              backgroundColor: "transparent",
            }}
          >
            {view === "trace" ? "Decoded Trace" : view === "opcodes" ? "Opcodes" : "Source"}
          </button>
        ))}
      </div>

      {/* Decoded Trace — human-readable function calls */}
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

      {/* Opcodes — raw execution trace */}
      {contentView === "opcodes" && (
      <CollapsiblePanel title="Execution Trace" count={totalSteps} defaultOpen>
        <div
          ref={traceListRef}
          className="overflow-y-auto"
          onScroll={handleScroll}
          style={{ maxHeight: "400px" }}
        >
          <div style={{ height: totalSteps * rowHeight, position: "relative" }}>
            {Array.from({ length: visibleEnd - visibleStart }, (_, i) => {
              const idx = visibleStart + i;
              const s = steps[idx]!;
              const isActive = idx === currentStep;
              const matchesFilter = !filteredIndices || filteredIndices.includes(idx);
              const depthFraction = maxDepth > 1 ? (s.depth - 1) / (maxDepth - 1) : 0;
              const depthHue = 260 - depthFraction * 200;
              return (
                <div
                  key={idx}
                  onClick={() => goTo(idx)}
                  className="flex items-center cursor-pointer text-xs"
                  style={{
                    position: "absolute",
                    top: idx * rowHeight,
                    height: rowHeight,
                    width: "100%",
                    fontFamily: "var(--font-mono)",
                    backgroundColor: isActive ? "var(--color-accent-muted)" : "transparent",
                    borderLeft: isActive
                      ? "3px solid var(--color-accent)"
                      : `3px solid hsla(${depthHue}, 60%, 50%, ${s.depth > 1 ? 0.5 : 0})`,
                    opacity: matchesFilter ? 1 : 0.3,
                    paddingLeft: `${8 + (s.depth - 1) * 6}px`,
                    paddingRight: "12px",
                  }}
                >
                  <span className="w-14 text-right mr-3 flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
                    {idx}
                  </span>
                  <span className="w-10 text-right mr-3 flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
                    {s.pc}
                  </span>
                  <span className="w-28 font-semibold mr-3 flex-shrink-0" style={{ color: getOpcodeColor(s.op) }}>
                    {s.op}
                  </span>
                  <span
                    className="flex-shrink-0"
                    style={{ color: s.gasCost > 100 ? "var(--color-warning)" : "var(--color-text-muted)" }}
                  >
                    {s.gasCost}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CollapsiblePanel>
      )}

      {/* Source — full verified file with current line highlighted */}
      {contentView === "source" && currentSourceFile && (
        <div
          className="card overflow-hidden"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
            maxHeight: "500px",
          }}
        >
          <SourceViewer
            file={currentSourceFile}
            currentLine={currentSourceLocation?.line ?? null}
            findings={slitherFindings
              .flatMap((f) =>
                f.elements
                  .filter((e) => e.sourceMapping?.lines?.length)
                  .flatMap((e) =>
                    (e.sourceMapping?.lines ?? []).map((line) => ({
                      line,
                      severity: f.impact,
                      message: `[${f.check}] ${f.description.split("\n")[0]}`,
                    })),
                  ),
              )
            }
          />
        </div>
      )}

      {contentView === "source" && !currentSourceFile && (
        <div
          className="card p-8 text-center space-y-3"
          >
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {sourceLoading ? "Loading verified source..." : "No verified source available for this contract"}
          </p>
          {!sourceLoading && activeContractAddress && (
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {activeContractAddress.slice(0, 10)}...{activeContractAddress.slice(-6)} is not verified on BlockScout
            </p>
          )}
        </div>
      )}

      {/* Storage — always visible below the active tab */}
      <div
        className="card overflow-hidden"
      >
        <PanelHeader title="Storage" count={storageDiff.length} suffix="changes" />
        <div className="overflow-y-auto" style={{ maxHeight: "200px" }}>
          {storageDiff.length === 0 ? (
            <div className="px-3 py-4 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
              {isStorageOp(step.op) ? "Storage read (no change)" : "No storage changes at this step"}
            </div>
          ) : (
            <div className="px-3 py-1 space-y-2">
              {storageDiff.map((d, i) => (
                <div key={i} className="text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                  <div className="flex items-center gap-1">
                    <span style={{ color: "var(--color-text-muted)" }}>slot:</span>
                    <span className="truncate" title={formatWord(d.slot)} style={{ color: "var(--color-warning)" }}>
                      {truncateWord(d.slot)}
                    </span>
                  </div>
                  {d.oldValue !== null && (
                    <div className="flex items-center gap-1 pl-4">
                      <span style={{ color: "var(--color-danger)" }}>-</span>
                      <span className="truncate" title={formatWord(d.oldValue)} style={{ color: "var(--color-text-secondary)" }}>
                        {truncateWord(d.oldValue)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 pl-4">
                    <span style={{ color: "var(--color-success)" }}>+</span>
                    <span className="truncate" title={formatWord(d.newValue)} style={{ color: "var(--color-accent)" }}>
                      {truncateWord(d.newValue)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stack + Memory — collapsed by default */}
      <CollapsiblePanel title="Stack" count={step.stack.length} defaultOpen={false}>
        <div className="overflow-y-auto px-3 py-1" style={{ maxHeight: "200px" }}>
          {step.stack.length === 0 ? (
            <div className="py-4 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>Stack is empty</div>
          ) : (
            [...step.stack].reverse().map((word, i) => {
              const actualIndex = step.stack.length - 1 - i;
              const changed = stackChanges.has(actualIndex);
              return (
                <div key={i} className="flex items-center text-xs py-0.5" style={{ fontFamily: "var(--font-mono)" }}>
                  <span className="w-8 text-right mr-2 flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>{i}</span>
                  <span
                    className="truncate"
                    title={formatWord(word)}
                    style={{ color: changed ? "var(--color-accent)" : "var(--color-text-primary)", fontWeight: changed ? 600 : 400 }}
                  >
                    {truncateWord(word)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel title="Memory" count={memorySize} suffix="bytes" defaultOpen={false}>
        <div className="overflow-y-auto px-3 py-1" style={{ maxHeight: "200px" }}>
          {memorySize === 0 ? (
            <div className="py-4 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>Memory is empty</div>
          ) : (
            <>
              {Array.from({ length: memoryRows }, (_, i) => {
                const offset = i * 16;
                const { hex, ascii } = formatMemoryRow(memoryHex, offset);
                return (
                  <div key={i} className="flex items-center text-xs py-0.5" style={{ fontFamily: "var(--font-mono)" }}>
                    <span className="w-12 text-right mr-2 flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
                      {offset.toString(16).padStart(4, "0")}
                    </span>
                    <span className="flex-1 mr-3" style={{ color: "var(--color-text-primary)" }}>{hex}</span>
                    <span className="flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>{ascii}</span>
                  </div>
                );
              })}
              {memorySize > 1024 && (
                <div className="text-xs py-1 text-center" style={{ color: "var(--color-text-muted)" }}>
                  Showing first 1KB of {memorySize.toLocaleString()} bytes
                </div>
              )}
            </>
          )}
        </div>
      </CollapsiblePanel>

        </div>{/* end right content */}
      </div>{/* end main layout flex */}

      {/* Keyboard shortcuts help */}
      <div
        className="flex flex-wrap gap-4 px-4 py-2 card text-xs"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
          color: "var(--color-text-muted)",
        }}
      >
        <Shortcut keys="← →" label="Step" />
        <Shortcut keys="Space" label="Forward" />
        <Shortcut keys="Home/End" label="Jump" />
        <Shortcut keys="C" label="Next CALL" />
        <Shortcut keys="S" label="Next SSTORE" />
        <Shortcut keys="L" label="Next LOG" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PanelHeader({
  title,
  count,
  suffix,
}: {
  title: string;
  count?: number;
  suffix?: string;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2 card-divider"
      style={{ backgroundColor: "var(--color-bg-secondary)" }}
    >
      <span
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {title}
      </span>
      {count !== undefined && (
        <span
          className="text-xs"
          style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}
        >
          {count.toLocaleString()} {suffix ?? "items"}
        </span>
      )}
    </div>
  );
}

function ControlButton({
  label,
  title,
  onClick,
  small,
  accent,
}: {
  label: string;
  title: string;
  onClick: () => void;
  small?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded font-mono font-semibold transition-colors"
      style={{
        padding: small ? "2px 6px" : "2px 10px",
        fontSize: small ? "10px" : "12px",
        backgroundColor: accent
          ? "var(--color-accent-muted)"
          : "var(--color-bg-secondary)",
        color: accent
          ? "var(--color-accent)"
          : "var(--color-text-primary)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      {label}
    </button>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <span>
      <kbd
        className="px-1.5 py-0.5 rounded text-xs mr-1"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border-default)",
          fontFamily: "var(--font-mono)",
          color: "var(--color-text-secondary)",
        }}
      >
        {keys}
      </kbd>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CollapsiblePanel — click header to show/hide body
// ---------------------------------------------------------------------------

function CollapsiblePanel({
  title,
  count,
  suffix,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  suffix?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="card overflow-hidden"
      style={{ backgroundColor: "var(--color-bg-card)", borderColor: "var(--color-border-default)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 card-divider cursor-pointer"
        style={{ backgroundColor: "var(--color-bg-secondary)" }}
      >
        <span className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {open ? "▼" : "▶"}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-secondary)" }}>
            {title}
          </span>
        </span>
        {count !== undefined && (
          <span className="text-xs" style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
            {count.toLocaleString()} {suffix ?? "items"}
          </span>
        )}
      </button>
      {open && children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CallTreeFromOpcodes — group opcode steps by CALL depth transitions
// ---------------------------------------------------------------------------

interface CallSegment {
  type: string; // CALL, DELEGATECALL, STATICCALL, CREATE, "internal", or "root"
  isInternal: boolean; // true = JUMP within same contract, false = cross-contract
  depth: number;
  startStep: number;
  endStep: number;
  stepCount: number;
  selector?: string; // 4-byte function selector if available
  children: CallSegment[];
}

function extractSelector(s: OpcodeStep): string | undefined {
  try {
    const stackLen = s.stack.length;
    const argsOffsetIdx = s.op === "CALL" || s.op === "CALLCODE" ? stackLen - 4 : stackLen - 3;
    if (argsOffsetIdx >= 0 && s.memory.length > 0) {
      const argsOffset = Number(BigInt(s.stack[argsOffsetIdx] ?? "0"));
      const memHex = s.memory.join("");
      const selectorHex = memHex.slice(argsOffset * 2, argsOffset * 2 + 8);
      if (selectorHex.length === 8) return "0x" + selectorHex;
    }
  } catch {
    // best-effort
  }
  return undefined;
}

interface FlatCallInfo {
  selector: string;
  to: string;
  type: string;
  value?: string;
  input: string; // full calldata — used to disambiguate selector collisions
}

function flattenCallTree(frame: CallFrame): FlatCallInfo[] {
  const result: FlatCallInfo[] = [];

  function walk(f: CallFrame) {
    for (const child of f.calls ?? []) {
      result.push({
        selector: child.input?.length >= 10 ? child.input.slice(0, 10).toLowerCase() : "",
        to: child.to ?? "",
        type: child.type ?? "CALL",
        value: child.value,
        input: child.input ?? "0x",
      });
      walk(child);
    }
  }

  walk(frame);
  return result;
}

// Keep backward compat
function flattenCallTreeSelectors(frame: CallFrame): string[] {
  return flattenCallTree(frame).map((c) => c.selector);
}

/**
 * Disambiguate 4byte selector collisions by checking if the calldata
 * length matches each candidate signature's expected parameter count.
 * ABI-encoded params are 32 bytes each (static types), so calldata
 * length = 4 (selector) + 32 * paramCount for simple signatures.
 */
function bestMatchSignature(
  candidates: SignatureMatch[],
  calldata: string,
): string | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0]!.textSignature;

  const dataBytes = (calldata.startsWith("0x") ? calldata.slice(2) : calldata).length / 2;
  const paramBytes = dataBytes - 4; // subtract selector

  for (const c of candidates) {
    // Count params from the signature: transfer(address,uint256) → 2
    const paramsStr = c.textSignature.split("(")[1]?.replace(")", "") ?? "";
    if (paramsStr === "") {
      // No params — calldata should be just the selector (4 bytes)
      if (paramBytes === 0) return c.textSignature;
      continue;
    }
    const paramCount = paramsStr.split(",").length;
    // Static params: each is 32 bytes. Dynamic params add a 32-byte offset pointer.
    // A simple heuristic: paramBytes should be >= 32 * paramCount
    if (paramBytes >= 32 * paramCount && paramBytes <= 32 * paramCount * 3) {
      return c.textSignature;
    }
  }

  // Fallback: prefer shorter signatures (less likely to be hash collisions)
  return [...candidates].sort((a, b) => a.textSignature.length - b.textSignature.length)[0]?.textSignature;
}

function buildCallTree(
  steps: OpcodeStep[],
  sourceMappings?: Record<number, SourceLocation | null>,
  callTreeSelectors?: string[],
): CallSegment {
  const root: CallSegment = {
    type: "root",
    isInternal: false,
    depth: 1,
    startStep: 0,
    endStep: steps.length - 1,
    stepCount: steps.length,
    children: [],
  };

  const stack: CallSegment[] = [root];
  const internalReturnStack: Array<{ returnStep: number; segment: CallSegment }> = [];
  let externalCallIndex = 0;

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    const parent = stack[stack.length - 1]!;

    // Check for internal call returns
    while (internalReturnStack.length > 0) {
      const top = internalReturnStack[internalReturnStack.length - 1]!;
      // If we've returned (PC jumped back to near where we came from)
      if (i > top.segment.startStep + 2 && s.depth === top.segment.depth) {
        const nextStep = steps[i];
        const prevStep = steps[i - 1];
        if (nextStep && prevStep && prevStep.op === "JUMP" && s.op === "JUMPDEST") {
          top.segment.endStep = i - 1;
          top.segment.stepCount = top.segment.endStep - top.segment.startStep + 1;
          internalReturnStack.pop();
          if (stack[stack.length - 1] === top.segment) stack.pop();
          continue;
        }
      }
      break;
    }

    if (isCallOp(s.op)) {
      // Get selector from call tree input data (reliable) or memory (fallback)
      const selector = callTreeSelectors?.[externalCallIndex] ?? extractSelector(s);
      externalCallIndex++;

      const child: CallSegment = {
        type: s.op,
        isInternal: false,
        depth: s.depth + 1,
        startStep: i,
        endStep: i,
        stepCount: 0,
        selector,
        children: [],
      };
      parent.children.push(child);
      stack.push(child);
    } else if (s.op === "JUMP" && i + 1 < steps.length) {
      // Use the compiler's source map jump type to identify internal function calls.
      // jumpType "i" = jump into internal function, "o" = return from it.
      // Without a source map, we skip internal call detection entirely —
      // JUMP is also used for if/else, loops, require, etc.
      const mapping = sourceMappings?.[s.pc];
      if (mapping?.jumpType === "i") {
        const child: CallSegment = {
          type: "internal",
          isInternal: true,
          depth: s.depth,
          startStep: i + 1,
          endStep: i + 1,
          stepCount: 0,
          children: [],
        };
        parent.children.push(child);
        stack.push(child);
        internalReturnStack.push({ returnStep: i, segment: child });
      }
    } else if (s.depth < parent.depth && stack.length > 1) {
      parent.endStep = i - 1;
      parent.stepCount = parent.endStep - parent.startStep + 1;
      stack.pop();
    }
  }

  // Close any remaining open segments
  while (stack.length > 1) {
    const seg = stack.pop()!;
    seg.endStep = steps.length - 1;
    seg.stepCount = seg.endStep - seg.startStep + 1;
  }
  root.stepCount = steps.length;

  return root;
}

// ---------------------------------------------------------------------------
// DecodedTrace — human-readable function call list
// Shows: WPLS(0xA107...).deposit{value: 1.0}()
// ---------------------------------------------------------------------------

function DecodedTrace({
  steps,
  currentStep,
  signatureMap,
  sourceMappings,
  callTrace,
  contractNames,
  onJumpTo,
}: {
  steps: OpcodeStep[];
  currentStep: number;
  signatureMap: Record<string, SignatureMatch[]>;
  sourceMappings: Record<number, SourceLocation | null>;
  callTrace?: CallFrame | null;
  contractNames: Record<string, string | null>;
  onJumpTo: (step: number) => void;
}) {
  const flatCalls = useMemo(
    () => callTrace ? flattenCallTree(callTrace) : [],
    [callTrace],
  );

  const entries = useMemo(() => {
    const result: Array<{
      step: number;
      depth: number;
      callType: string;
      selector?: string;
      targetAddress?: string;
      decodedName?: string;
      sourceLocation?: SourceLocation;
      isInternal: boolean;
    }> = [];

    let extCallIdx = 0;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!;

      if (isCallOp(s.op)) {
        const callInfo = flatCalls[extCallIdx];
        const selector = callInfo?.selector ?? extractSelector(s);
        const targetAddress = callInfo?.to ?? undefined;
        const calldata = callInfo?.input ?? "";
        extCallIdx++;
        // Priority: well-known signatures → 4byte API with disambiguation
        const wellKnown = selector ? lookupWellKnown(selector) : undefined;
        const candidates = selector ? signatureMap[selector.toLowerCase()] ?? [] : [];
        const resolved = wellKnown?.signature ?? bestMatchSignature(candidates, calldata);

        result.push({
          step: i,
          depth: s.depth,
          callType: s.op,
          selector,
          targetAddress,
          decodedName: resolved,
          sourceLocation: sourceMappings[s.pc] ?? undefined,
          isInternal: false,
        });
      } else if (s.op === "JUMP") {
        const mapping = sourceMappings[s.pc];
        if (mapping?.jumpType === "i") {
          result.push({
            step: i,
            depth: s.depth,
            callType: "internal",
            sourceLocation: mapping,
            decodedName: mapping.sourceSnippet.trim().split("(")[0]?.split(" ").pop(),
            isInternal: true,
          });
        }
      }
    }
    return result;
  }, [steps, signatureMap, sourceMappings]);

  return (
    <div
      className="card overflow-hidden"
      style={{ backgroundColor: "var(--color-bg-card)", borderColor: "var(--color-border-default)" }}
    >
      <PanelHeader title="Decoded Trace" count={entries.length} suffix="calls" />
      <div className="overflow-y-auto" style={{ maxHeight: "400px" }}>
        {entries.length === 0 ? (
          <div className="px-3 py-6 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
            No function calls detected in this trace
          </div>
        ) : (
          entries.map((entry, i) => {
            const isActive = currentStep >= entry.step && (
              i + 1 >= entries.length || currentStep < entries[i + 1]!.step
            );

            const bgColor = entry.isInternal
              ? "rgba(148, 163, 184, 0.04)"
              : CALL_TYPE_BG[entry.callType] ?? "transparent";
            const borderColor = isActive
              ? "var(--color-accent)"
              : entry.isInternal
                ? "rgba(148, 163, 184, 0.2)"
                : CALL_TYPE_BORDER[entry.callType] ?? "transparent";

            // Build human-readable: Contract(0xAddr).functionName(args)
            const funcSig = entry.decodedName
              ? entry.decodedName
              : entry.selector
                ? `${entry.selector}()`
                : "???()";
            const funcNameOnly = funcSig.split("(")[0]!;
            const funcArgs = funcSig.includes("(") ? `(${funcSig.split("(").slice(1).join("(")}` : "()";
            // Don't show full args signature inline — just the name
            const addrShort = entry.targetAddress
              ? `${entry.targetAddress.slice(0, 6)}...${entry.targetAddress.slice(-4)}`
              : "";

            return (
              <div
                key={i}
                onClick={() => onJumpTo(entry.step)}
                className="flex items-center gap-1 px-3 py-1.5 cursor-pointer text-xs hover:opacity-80"
                title={entry.decodedName ? `${entry.targetAddress ?? ""}.${funcSig}` : entry.selector}
                style={{
                  paddingLeft: `${12 + (entry.depth - 1) * 16}px`,
                  backgroundColor: isActive ? "rgba(139, 92, 246, 0.12)" : bgColor,
                  borderLeft: `3px solid ${borderColor}`,
                  fontFamily: "var(--font-mono)",
                  opacity: entry.isInternal ? 0.6 : 1,
                }}
              >
                {entry.targetAddress && (() => {
                  const contractName = contractNames[entry.targetAddress.toLowerCase()];
                  const interfaceName = entry.selector ? lookupWellKnown(entry.selector)?.interface : undefined;
                  const displayLabel = contractName ?? interfaceName;
                  return (
                    <>
                      {displayLabel ? (
                        <span style={{ color: contractName ? "var(--color-accent)" : "var(--color-text-secondary)" }}>
                          {displayLabel}
                        </span>
                      ) : null}
                      <span style={{ color: "var(--color-text-muted)" }} title={entry.targetAddress}>
                        ({addrShort})
                      </span>
                      <span style={{ color: "var(--color-text-muted)" }}>.</span>
                    </>
                  );
                })()}
                <span style={{ color: "var(--color-text-primary)", fontWeight: isActive ? 600 : 400 }}>
                  {funcNameOnly}
                </span>
                <span style={{ color: "var(--color-text-muted)" }}>
                  {funcArgs}
                </span>
                {entry.sourceLocation && (
                  <span className="ml-2" style={{ color: "var(--color-text-muted)" }}>
                    {entry.sourceLocation.file}:{entry.sourceLocation.line}
                  </span>
                )}
                <span className="ml-auto flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
                  {entry.step}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CallTreeFromOpcodes({
  steps,
  currentStep,
  onJumpTo,
  signatureMap,
  sourceMappings,
  callTrace,
  inline,
}: {
  steps: OpcodeStep[];
  currentStep: number;
  onJumpTo: (step: number) => void;
  signatureMap: Record<string, SignatureMatch[]>;
  sourceMappings: Record<number, SourceLocation | null>;
  callTrace?: CallFrame | null;
  inline?: boolean;
}) {
  const callTreeSelectors = useMemo(
    () => callTrace ? flattenCallTreeSelectors(callTrace) : undefined,
    [callTrace],
  );
  const tree = useMemo(
    () => buildCallTree(steps, sourceMappings, callTreeSelectors),
    [steps, sourceMappings, callTreeSelectors],
  );

  if (inline) {
    return <CallSegmentRow segment={tree} currentStep={currentStep} onJumpTo={onJumpTo} depth={0} signatureMap={signatureMap} />;
  }

  return (
    <div
      className="card overflow-hidden flex flex-col h-full"
      style={{ backgroundColor: "var(--color-bg-card)", borderColor: "var(--color-border-default)" }}
    >
      <PanelHeader title="Call Tree" count={tree.children.length} suffix="calls" />
      <div className="overflow-y-auto flex-1">
        <CallSegmentRow segment={tree} currentStep={currentStep} onJumpTo={onJumpTo} depth={0} signatureMap={signatureMap} />
      </div>
    </div>
  );
}

// Background colors for call types — subtle tints
// Red/amber reserved for errors — use cool palette for call types
const CALL_TYPE_BG: Record<string, string> = {
  CALL: "rgba(96, 165, 250, 0.08)",         // blue — standard external call
  STATICCALL: "rgba(52, 211, 153, 0.08)",   // green — read-only
  DELEGATECALL: "rgba(167, 139, 250, 0.08)",// purple — proxy/delegate
  CALLCODE: "rgba(167, 139, 250, 0.08)",    // purple
  CREATE: "rgba(56, 182, 194, 0.08)",       // teal — deployment
  CREATE2: "rgba(56, 182, 194, 0.08)",      // teal
  root: "transparent",
};

const CALL_TYPE_BORDER: Record<string, string> = {
  CALL: "rgba(96, 165, 250, 0.4)",
  STATICCALL: "rgba(52, 211, 153, 0.4)",
  DELEGATECALL: "rgba(167, 139, 250, 0.4)",
  CALLCODE: "rgba(167, 139, 250, 0.4)",
  CREATE: "rgba(56, 182, 194, 0.4)",
  CREATE2: "rgba(56, 182, 194, 0.4)",
  root: "transparent",
};

function CallSegmentRow({
  segment,
  currentStep,
  onJumpTo,
  depth,
  signatureMap,
}: {
  segment: CallSegment;
  currentStep: number;
  onJumpTo: (step: number) => void;
  depth: number;
  signatureMap: Record<string, SignatureMatch[]>;
}) {
  const [expanded, setExpanded] = useState(depth < 3);
  const [hovered, setHovered] = useState(false);
  const isActive = currentStep >= segment.startStep && currentStep <= segment.endStep;
  const hasChildren = segment.children.length > 0;

  const resolvedName = segment.selector
    ? signatureMap[segment.selector.toLowerCase()]?.[0]?.textSignature
    : undefined;

  // Primary display: function name, or "internal" for same-contract jumps
  const primaryText = resolvedName
    ? resolvedName.split("(")[0]!
    : segment.selector
      ? segment.selector
      : segment.type === "root"
        ? "Transaction"
        : segment.isInternal
          ? "internal fn"
          : segment.type;

  const fullSignature = resolvedName ?? segment.selector ?? segment.type;

  const bgColor = isActive
    ? "rgba(139, 92, 246, 0.12)"
    : segment.isInternal
      ? "rgba(148, 163, 184, 0.04)"
      : CALL_TYPE_BG[segment.type] ?? "transparent";
  const borderColor = isActive
    ? "var(--color-accent)"
    : segment.isInternal
      ? "rgba(148, 163, 184, 0.2)"
      : CALL_TYPE_BORDER[segment.type] ?? "transparent";
  const rowOpacity = segment.isInternal ? 0.6 : 1;

  return (
    <div>
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer text-xs transition-colors relative"
        onClick={() => onJumpTo(segment.startStep)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          paddingLeft: `${8 + depth * 16}px`,
          backgroundColor: bgColor,
          borderLeft: `3px solid ${borderColor}`,
          fontFamily: "var(--font-mono)",
          opacity: rowOpacity,
        }}
      >
        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="w-4 text-center flex-shrink-0"
            style={{ color: "var(--color-text-muted)" }}
          >
            {expanded ? "▼" : "▶"}
          </button>
        )}
        {!hasChildren && <span className="w-4 flex-shrink-0" />}

        {/* Primary: function name */}
        <span
          className="font-semibold truncate"
          style={{ color: isActive ? "var(--color-accent)" : "var(--color-text-primary)" }}
        >
          {primaryText}
        </span>

        {hasChildren && (
          <span className="flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
            ({segment.children.length})
          </span>
        )}

        {/* Hover detail tooltip */}
        {hovered && segment.type !== "root" && (
          <div
            className="absolute left-full ml-2 z-20 px-3 py-2 rounded-lg shadow-lg text-xs whitespace-nowrap"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              border: "1px solid var(--color-border-default)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono)",
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <div style={{ color: OPCODE_COLORS[segment.type] ?? "#94A3B8" }}>{segment.type}</div>
            {resolvedName && <div style={{ color: "var(--color-text-secondary)" }}>{fullSignature}</div>}
            {segment.selector && !resolvedName && (
              <div style={{ color: "var(--color-text-muted)" }}>selector: {segment.selector}</div>
            )}
            <div style={{ color: "var(--color-text-muted)" }}>steps {segment.startStep}–{segment.endStep} ({segment.stepCount.toLocaleString()} ops)</div>
          </div>
        )}
      </div>

      {expanded && segment.children.map((child, i) => (
        <CallSegmentRow
          key={i}
          segment={child}
          currentStep={currentStep}
          onJumpTo={onJumpTo}
          depth={depth + 1}
          signatureMap={signatureMap}
        />
      ))}
    </div>
  );
}
