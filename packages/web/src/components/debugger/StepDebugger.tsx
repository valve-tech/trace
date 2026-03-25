import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { OpcodeStep } from "../../api/debugger";
import { fetchSource, fetchSourceMappings, analyzeContract, type ContractSource, type SourceLocation, type SlitherFinding } from "../../api/source";
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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StepDebugger({ steps, contractAddress }: StepDebuggerProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [opcodeFilter, setOpcodeFilter] = useState("");
  const [showSource, setShowSource] = useState(false);
  const [sourceData, setSourceData] = useState<ContractSource | null>(null);
  const [sourceMappings, setSourceMappings] = useState<Record<number, SourceLocation | null>>({});
  const [sourceLoading, setSourceLoading] = useState(false);
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
    setSourceData(null);
    setSourceMappings({});
    setShowSource(false);
    setSlitherFindings([]);
    setShowFindings(false);
  }, [steps]);

  // Slither analysis handler
  const handleAnalyze = useCallback(async () => {
    if (!contractAddress || slitherLoading) return;
    setSlitherLoading(true);
    try {
      const res = await analyzeContract(contractAddress);
      if (res.ok && res.analysis) {
        setSlitherFindings(res.analysis.findings);
        setShowFindings(true);
        // Also enable source view if not already on
        if (!showSource) setShowSource(true);
      }
    } catch (err) {
      console.error("[StepDebugger] Slither analysis error:", err);
    } finally {
      setSlitherLoading(false);
    }
  }, [contractAddress, slitherLoading, showSource]);

  // Fetch source code when toggled on
  useEffect(() => {
    if (!showSource || !contractAddress || sourceData) return;

    let cancelled = false;
    setSourceLoading(true);

    (async () => {
      try {
        const res = await fetchSource(contractAddress);
        if (cancelled) return;
        if (!res.ok || !res.source) {
          setSourceLoading(false);
          return;
        }
        setSourceData(res.source);

        // If source map is available, map all unique PCs to source locations
        if (res.source.hasSourceMap) {
          const uniquePcs = [...new Set(steps.map((s) => s.pc))];
          const mapRes = await fetchSourceMappings(contractAddress, uniquePcs);
          if (!cancelled && mapRes.ok && mapRes.mappings) {
            setSourceMappings(mapRes.mappings);
          }
        }
      } catch (err) {
        console.error("[StepDebugger] source fetch error:", err);
      } finally {
        if (!cancelled) setSourceLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [showSource, contractAddress, sourceData, steps]);

  // ---- Navigation ----

  const goTo = useCallback(
    (step: number) => {
      setCurrentStep(Math.max(0, Math.min(step, totalSteps - 1)));
    },
    [totalSteps],
  );

  const stepForward = useCallback(() => goTo(currentStep + 1), [currentStep, goTo]);
  const stepBackward = useCallback(() => goTo(currentStep - 1), [currentStep, goTo]);

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

  const currentSourceLocation = sourceMappings[step.pc] ?? null;
  const currentSourceFile = currentSourceLocation && sourceData
    ? sourceData.files.find((f) => f.name === currentSourceLocation.file) ?? sourceData.files[0]
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Controls bar */}
      <div
        className="flex items-center gap-3 px-4 py-2 rounded-lg border"
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
              onClick={() => setShowSource(!showSource)}
              className="rounded font-mono font-semibold transition-colors text-xs px-2 py-1"
              style={{
                backgroundColor: showSource
                  ? "var(--color-accent)"
                  : "var(--color-bg-secondary)",
                color: showSource ? "#fff" : "var(--color-text-primary)",
                border: "1px solid var(--color-border-default)",
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
        className="px-4 py-2 rounded-lg border text-xs flex items-center gap-1 overflow-x-auto"
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

      {/* Source code panel (when toggled on) */}
      {showSource && currentSourceFile && (
        <div
          className="rounded-lg border overflow-hidden"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
            maxHeight: "300px",
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

      {showSource && !sourceData && !sourceLoading && (
        <div
          className="rounded-lg border p-4 text-center text-sm"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-muted)",
          }}
        >
          Verified source not found for this contract
        </div>
      )}

      {/* Slither findings panel */}
      {showFindings && slitherFindings.length > 0 && (
        <FindingsPanel findings={slitherFindings} />
      )}

      {/* Main panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" style={{ minHeight: "600px" }}>
        {/* Left: Execution trace */}
        <div
          className="rounded-lg border overflow-hidden flex flex-col"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <PanelHeader title="Execution Trace" count={totalSteps} />
          <div
            ref={traceListRef}
            className="flex-1 overflow-y-auto"
            onScroll={handleScroll}
            style={{ maxHeight: "600px" }}
          >
            {/* Spacer for virtual scrolling */}
            <div style={{ height: totalSteps * rowHeight, position: "relative" }}>
              {Array.from({ length: visibleEnd - visibleStart }, (_, i) => {
                const idx = visibleStart + i;
                const s = steps[idx]!;
                const isActive = idx === currentStep;
                const matchesFilter = !filteredIndices || filteredIndices.includes(idx);
                const depthFraction = maxDepth > 1 ? (s.depth - 1) / (maxDepth - 1) : 0;
                const depthHue = 260 - depthFraction * 200; // purple → blue → teal → green
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
                      backgroundColor: isActive
                        ? "var(--color-accent-muted)"
                        : "transparent",
                      borderLeft: isActive
                        ? "3px solid var(--color-accent)"
                        : `3px solid hsla(${depthHue}, 60%, 50%, ${s.depth > 1 ? 0.5 : 0})`,
                      opacity: matchesFilter ? 1 : 0.3,
                      paddingLeft: `${8 + (s.depth - 1) * 6}px`,
                      paddingRight: "12px",
                    }}
                  >
                    <span
                      className="w-14 text-right mr-3 flex-shrink-0"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {idx}
                    </span>
                    <span
                      className="w-10 text-right mr-3 flex-shrink-0"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {s.pc}
                    </span>
                    <span
                      className="w-28 font-semibold mr-3 flex-shrink-0"
                      style={{ color: getOpcodeColor(s.op) }}
                    >
                      {s.op}
                    </span>
                    <span
                      className="flex-shrink-0"
                      style={{
                        color: s.gasCost > 100
                          ? "var(--color-warning)"
                          : "var(--color-text-muted)",
                      }}
                    >
                      {s.gasCost}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: State panels */}
        <div className="flex flex-col gap-3">
          {/* Stack */}
          <div
            className="rounded-lg border overflow-hidden"
            style={{
              backgroundColor: "var(--color-bg-card)",
              borderColor: "var(--color-border-default)",
            }}
          >
            <PanelHeader title="Stack" count={step.stack.length} />
            <div className="overflow-y-auto" style={{ maxHeight: "200px" }}>
              {step.stack.length === 0 ? (
                <div
                  className="px-3 py-4 text-xs text-center"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Stack is empty
                </div>
              ) : (
                <div className="px-3 py-1">
                  {[...step.stack].reverse().map((word, i) => {
                    const actualIndex = step.stack.length - 1 - i;
                    const changed = stackChanges.has(actualIndex);
                    return (
                      <div
                        key={i}
                        className="flex items-center text-xs py-0.5"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        <span
                          className="w-8 text-right mr-2 flex-shrink-0"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {i}
                        </span>
                        <span
                          className="truncate"
                          title={formatWord(word)}
                          style={{
                            color: changed
                              ? "var(--color-accent)"
                              : "var(--color-text-primary)",
                            fontWeight: changed ? 600 : 400,
                          }}
                        >
                          {truncateWord(word)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Memory */}
          <div
            className="rounded-lg border overflow-hidden"
            style={{
              backgroundColor: "var(--color-bg-card)",
              borderColor: "var(--color-border-default)",
            }}
          >
            <PanelHeader title="Memory" count={memorySize} suffix="bytes" />
            <div className="overflow-y-auto" style={{ maxHeight: "200px" }}>
              {memorySize === 0 ? (
                <div
                  className="px-3 py-4 text-xs text-center"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Memory is empty
                </div>
              ) : (
                <div className="px-3 py-1">
                  {Array.from({ length: memoryRows }, (_, i) => {
                    const offset = i * 16;
                    const { hex, ascii } = formatMemoryRow(memoryHex, offset);
                    return (
                      <div
                        key={i}
                        className="flex items-center text-xs py-0.5"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        <span
                          className="w-12 text-right mr-2 flex-shrink-0"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {offset.toString(16).padStart(4, "0")}
                        </span>
                        <span
                          className="flex-1 mr-3"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {hex}
                        </span>
                        <span
                          className="flex-shrink-0"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {ascii}
                        </span>
                      </div>
                    );
                  })}
                  {memorySize > 1024 && (
                    <div
                      className="text-xs py-1 text-center"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Showing first 1KB of {memorySize.toLocaleString()} bytes
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Storage */}
          <div
            className="rounded-lg border overflow-hidden"
            style={{
              backgroundColor: "var(--color-bg-card)",
              borderColor: "var(--color-border-default)",
            }}
          >
            <PanelHeader title="Storage" count={storageDiff.length} suffix="changes" />
            <div className="overflow-y-auto" style={{ maxHeight: "200px" }}>
              {storageDiff.length === 0 ? (
                <div
                  className="px-3 py-4 text-xs text-center"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {isStorageOp(step.op)
                    ? "Storage read (no change)"
                    : "No storage changes at this step"}
                </div>
              ) : (
                <div className="px-3 py-1 space-y-2">
                  {storageDiff.map((d, i) => (
                    <div key={i} className="text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                      <div className="flex items-center gap-1">
                        <span style={{ color: "var(--color-text-muted)" }}>slot:</span>
                        <span
                          className="truncate"
                          title={formatWord(d.slot)}
                          style={{ color: "var(--color-warning)" }}
                        >
                          {truncateWord(d.slot)}
                        </span>
                      </div>
                      {d.oldValue !== null && (
                        <div className="flex items-center gap-1 pl-4">
                          <span style={{ color: "var(--color-danger)" }}>-</span>
                          <span
                            className="truncate"
                            title={formatWord(d.oldValue)}
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            {truncateWord(d.oldValue)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 pl-4">
                        <span style={{ color: "var(--color-success)" }}>+</span>
                        <span
                          className="truncate"
                          title={formatWord(d.newValue)}
                          style={{ color: "var(--color-accent)" }}
                        >
                          {truncateWord(d.newValue)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts help */}
      <div
        className="flex flex-wrap gap-4 px-4 py-2 rounded-lg border text-xs"
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
      className="flex items-center justify-between px-3 py-2 border-b"
      style={{
        borderColor: "var(--color-border-default)",
        backgroundColor: "var(--color-bg-secondary)",
      }}
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
