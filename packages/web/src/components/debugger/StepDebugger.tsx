import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { OpcodeStep, CallFrame } from "../../api/debugger";
import { analyzeContract, type SourceLocation, type SlitherFinding, type ContractSource } from "../../api/source";
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
// Source-based function name resolution
// ---------------------------------------------------------------------------

interface SourceFuncEntry {
  name: string;
  /** 0-based character offset of the `function` keyword across all concatenated
   *  source files. Used for proportional PC-to-function matching. */
  charOffset: number;
}

/**
 * Extract all named `function name(` declarations from all source files,
 * sorted by their character offset in the concatenated source.
 */
function extractSourceFunctions(sourceData: ContractSource): SourceFuncEntry[] {
  const entries: SourceFuncEntry[] = [];
  let globalOffset = 0;
  for (const file of sourceData.files) {
    const pattern = /\bfunction\s+(\w+)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(file.content)) !== null) {
      entries.push({ name: m[1]!, charOffset: globalOffset + m.index });
    }
    globalOffset += file.content.length;
  }
  entries.sort((a, b) => a.charOffset - b.charOffset);
  return entries;
}

/**
 * Given a target PC (the JUMPDEST we land on) and the PC range of the trace,
 * return the function name whose source position most closely corresponds to
 * the target PC's proportional position in the bytecode range.
 *
 * This approximation works well when source order mirrors bytecode order
 * (the common case for Solidity without heavy inlining).
 */
function resolveFuncNameByProportion(
  targetPc: number,
  minPc: number,
  maxPc: number,
  sourceFuncs: SourceFuncEntry[],
  totalSourceChars: number,
): string | null {
  if (sourceFuncs.length === 0 || maxPc <= minPc || totalSourceChars === 0) return null;
  const fraction = (targetPc - minPc) / (maxPc - minPc);
  const targetChar = Math.round(fraction * totalSourceChars);
  let best: SourceFuncEntry | null = null;
  let bestDist = Infinity;
  for (const fn of sourceFuncs) {
    const dist = Math.abs(fn.charOffset - targetChar);
    if (dist < bestDist) {
      bestDist = dist;
      best = fn;
    }
  }
  return best?.name ?? null;
}

// ---------------------------------------------------------------------------
// Hex/Memory helpers
// ---------------------------------------------------------------------------

function formatWord(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return "0x" + clean.padStart(64, "0");
}

function truncateWord(hex: string): string {
  return formatWord(hex);
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

  const stepForward = useCallback(() => { setOverrideLine(null); goTo(currentStep + 1); }, [currentStep, goTo]);
  const stepBackward = useCallback(() => { setOverrideLine(null); goTo(currentStep - 1); }, [currentStep, goTo]);

  // Jump to a step AND switch to source view
  // Track a pending function name to search for in the source after it loads
  const [overrideLine, setOverrideLine] = useState<number | null>(null);
  const [pendingFuncSearch, setPendingFuncSearch] = useState<string | null>(null);
  const [scrollKey, setScrollKey] = useState(0);

  // Jump to a step, switch to source, and try to scroll to the function definition.
  // Accepts an optional funcName so the call tree row can pass the resolved name directly.
  const jumpToAndShowSource = useCallback(
    (step: number, funcName?: string) => {
      goTo(step);
      setContentView("source");
      setScrollKey((k) => k + 1);
      if (funcName) {
        setPendingFuncSearch(funcName);
      }
    },
    [goTo],
  );

  const jumpToNext = useCallback(
    (predicate: (op: string) => boolean): void => {
      setOverrideLine(null);
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

  // Resolve pending function search → line number when source loads
  // Search for the pending function in the currently loaded source.
  // If not found (e.g., proxy contract), search all cached source files.
  useEffect(() => {
    if (!pendingFuncSearch || !sourceData) return;

    const funcPattern = new RegExp(`function\\s+${pendingFuncSearch}\\s*\\(`);
    const varPattern = new RegExp(`\\b${pendingFuncSearch}\\b`);

    // Search through all source files
    for (const file of sourceData.files ?? []) {
      const lines = file.content.split("\n");

      // Track whether we're inside a contract{} or interface{} block
      // Prefer matches inside contract blocks over interface blocks
      let inInterface = false;
      let inContract = false;
      let braceDepth = 0;
      let interfaceMatch: number | null = null;
      let contractMatch: number | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;

        // Track block context
        if (/\binterface\s+\w+/.test(line)) inInterface = true;
        if (/\bcontract\s+\w+/.test(line) || /\blibrary\s+\w+/.test(line)) { inContract = true; inInterface = false; }

        for (const ch of line) {
          if (ch === "{") braceDepth++;
          if (ch === "}") {
            braceDepth--;
            if (braceDepth === 0) { inInterface = false; inContract = false; }
          }
        }

        // Check for function definition with a body (not just a signature)
        if (funcPattern.test(line)) {
          if (inContract && !inInterface) {
            contractMatch = i + 1;
          } else if (inInterface && interfaceMatch === null) {
            interfaceMatch = i + 1;
          } else if (contractMatch === null && interfaceMatch === null) {
            contractMatch = i + 1;
          }
        }

        // Check for public state variable
        if (varPattern.test(line) && /\bpublic\b/.test(line) && !/^\s*\/\//.test(line)) {
          if (inContract && contractMatch === null) {
            contractMatch = i + 1;
          }
        }
      }

      // Prefer contract match over interface match
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

  // Use override line (from call tree click) if set, otherwise use source map line
  const effectiveLine = overrideLine ?? currentSourceLocation?.line ?? null;


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
        <div className="hidden lg:block w-[280px] flex-shrink-0 sticky top-0 self-start" style={{ maxHeight: "calc(100vh - 200px)" }}>
          <CallTreeFromOpcodes steps={steps} onJumpTo={jumpToAndShowSource} signatureMap={signatureMap} sourceMappings={sourceMappings} sourceData={sourceData} callTrace={callTrace} contractNames={contractNames} />
        </div>
        <div className="lg:hidden">
          <CollapsiblePanel title="Call Tree" count={steps.length} suffix="ops" defaultOpen={false}>
            <div style={{ maxHeight: "250px" }} className="overflow-y-auto">
              <CallTreeFromOpcodes steps={steps} onJumpTo={jumpToAndShowSource} signatureMap={signatureMap} sourceMappings={sourceMappings} sourceData={sourceData} callTrace={callTrace} contractNames={contractNames} inline />
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
            currentLine={effectiveLine}
            scrollKey={scrollKey}
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
  onJumpTo: (step: number, funcName?: string) => void;
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

interface InternalCall {
  stepIndex: number;
  funcName: string;
  line: number;
}

function CallTreeFromOpcodes({
  steps,
  onJumpTo,
  signatureMap,
  sourceMappings,
  sourceData,
  callTrace,
  contractNames,
  inline,
}: {
  steps: OpcodeStep[];
  onJumpTo: (step: number, funcName?: string) => void;
  signatureMap: Record<string, SignatureMatch[]>;
  sourceMappings: Record<number, SourceLocation | null>;
  sourceData: ContractSource | null;
  callTrace?: CallFrame | null;
  contractNames: Record<string, string | null>;
  inline?: boolean;
}) {
  // Pre-compute: map each CallFrame to its opcode step index
  // Also detect internal function calls (JUMP with jumpType "i" from source map)
  const { frameStepMap, internalCallsByFrame } = useMemo((): {
    frameStepMap: Map<CallFrame, number>;
    internalCallsByFrame: Map<CallFrame, InternalCall[]>;
  } => {
    const map = new Map<CallFrame, number>();
    const internals = new Map<CallFrame, InternalCall[]>();
    if (!callTrace) return { frameStepMap: map, internalCallsByFrame: internals };

    // Pre-compute source function list for proportional PC→name resolution.
    // Only populated when source is available but source maps are not.
    const sourceFuncs = sourceData ? extractSourceFunctions(sourceData) : [];
    const totalSourceChars = sourceData
      ? sourceData.files.reduce((sum, f) => sum + f.content.length, 0)
      : 0;

    // PC range across the entire trace for proportional mapping
    let minPc = Infinity;
    let maxPc = -Infinity;
    for (const s of steps) {
      if (s.pc < minPc) minPc = s.pc;
      if (s.pc > maxPc) maxPc = s.pc;
    }

    const callSteps: number[] = [];
    for (let i = 0; i < steps.length; i++) {
      if (isCallOp(steps[i]!.op)) callSteps.push(i + 1);
    }

    let idx = 0;
    function assignSteps(frame: CallFrame, isRoot: boolean) {
      const start = isRoot ? 0 : (callSteps[idx] ?? 0);
      if (!isRoot) idx++;
      map.set(frame, start);

      for (const child of frame.calls ?? []) {
        assignSteps(child, false);
      }

      // Determine this frame's opcode range (from its start to next depth change back)
      const end = (() => {
        for (let i = start + 1; i < steps.length; i++) {
          if (isCallOp(steps[i]!.op)) return i;
          if (i > 0 && steps[i]!.depth < steps[start]!.depth) return i;
        }
        return steps.length;
      })();

      // Find internal calls within this frame
      const internalList: InternalCall[] = [];
      for (let i = start; i < end; i++) {
        const s = steps[i];
        if (!s || s.op !== "JUMP") continue;

        // Primary: source map confirms an internal call (jumpType "i")
        const mapping = sourceMappings[s.pc];
        if (mapping?.jumpType === "i") {
          const snippet = mapping.sourceSnippet.trim();
          const match = snippet.match(/(\w+)\s*\(/);
          const funcName = match?.[1] ?? "internal";
          internalList.push({ stepIndex: i, funcName, line: mapping.line });
          continue;
        }

        // Heuristic: JUMP to a non-sequential JUMPDEST at the same depth —
        // large PC delta indicates an internal function dispatch rather than a
        // tight loop or short conditional branch.
        if (i + 1 >= end) continue;
        const next = steps[i + 1];
        if (!next || next.op !== "JUMPDEST" || next.depth !== s.depth) continue;
        const pcDelta = next.pc - s.pc;
        if (pcDelta >= -10 && pcDelta <= 30) continue;

        // --- Resolve the function name ---

        // Step 1: scan the next 20 opcodes after the JUMPDEST for a source map
        // snippet that names the function (works when source maps exist).
        let funcName: string | null = null;
        for (let j = i + 1; j < Math.min(i + 20, end); j++) {
          const jMap = sourceMappings[steps[j]!.pc];
          if (jMap?.sourceSnippet) {
            const fnMatch = jMap.sourceSnippet.match(/function\s+(\w+)/);
            if (fnMatch) {
              funcName = fnMatch[1]!;
              break;
            }
          }
        }

        // Step 2: when no source map entry was found, use the proportional
        // PC→source-function approach if source code is available.
        if (funcName === null && sourceFuncs.length > 0) {
          funcName = resolveFuncNameByProportion(
            next.pc,
            minPc,
            maxPc,
            sourceFuncs,
            totalSourceChars,
          );
        }

        internalList.push({ stepIndex: i, funcName: funcName ?? `fn@${next.pc}`, line: 0 });
      }
      if (internalList.length > 0) internals.set(frame, internalList);
    }
    assignSteps(callTrace, true);
    return { frameStepMap: map, internalCallsByFrame: internals };
  }, [callTrace, steps, sourceMappings, sourceData]);

  const [selectedFrame, setSelectedFrame] = useState<CallFrame | null>(null);

  if (callTrace) {
    const content = <CallFrameRow frame={callTrace} depth={0} onJumpTo={onJumpTo} signatureMap={signatureMap} contractNames={contractNames} frameStepMap={frameStepMap} internalCallsByFrame={internalCallsByFrame} onSelect={setSelectedFrame} selectedFrame={selectedFrame} />;

    if (inline) return content;

    return (
      <div className="card overflow-hidden flex flex-col h-full">
        <PanelHeader title="Call Tree" count={callTrace.calls?.length ?? 0} suffix="calls" />
        <div className="overflow-auto flex-1">
          <div style={{ minWidth: "fit-content" }}>
            {content}
          </div>
        </div>
        {/* Selected frame detail panel */}
        {selectedFrame && (
          <FrameDetailPanel frame={selectedFrame} contractNames={contractNames} signatureMap={signatureMap} />
        )}
      </div>
    );
  }

  // Fallback: no call trace available
  if (inline) return <div className="text-xs p-2" style={{ color: "var(--color-text-muted)" }}>No call tree</div>;
  return (
    <div className="card overflow-hidden flex flex-col h-full">
      <PanelHeader title="Call Tree" count={0} suffix="calls" />
      <div className="p-3 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>No call tree available</div>
    </div>
  );
}

/**
 * Render a single CallFrame from the API call tree.
 * Step index comes from the pre-computed frameStepMap (no mutable counters).
 */
function CallFrameRow({
  frame,
  depth,
  onJumpTo,
  signatureMap,
  contractNames,
  frameStepMap,
  internalCallsByFrame,
  onSelect,
  selectedFrame,
}: {
  frame: CallFrame;
  depth: number;
  onJumpTo: (step: number, funcName?: string) => void;
  signatureMap: Record<string, SignatureMatch[]>;
  contractNames: Record<string, string | null>;
  frameStepMap: Map<CallFrame, number>;
  internalCallsByFrame: Map<CallFrame, InternalCall[]>;
  onSelect?: (frame: CallFrame) => void;
  selectedFrame?: CallFrame | null;
}) {
  const [expanded, setExpanded] = useState(depth < 4);
  const [hovered, setHovered] = useState(false);
  const hasChildren = (frame.calls?.length ?? 0) > 0;

  const selector = frame.input?.length >= 10 ? frame.input.slice(0, 10).toLowerCase() : "";

  const contractName = frame.to ? contractNames[frame.to.toLowerCase()] : null;
  const wellKnown = selector ? lookupWellKnown(selector) : undefined;
  const sigMatch = selector ? signatureMap[selector]?.[0]?.textSignature : undefined;
  const resolvedSig = wellKnown?.signature ?? sigMatch;
  const funcName = resolvedSig ? resolvedSig.split("(")[0]! : selector || "???";
  const displayLabel = contractName ?? wellKnown?.interface ?? null;

  const stepIndex = frameStepMap.get(frame) ?? 0;

  const isSelected = selectedFrame === frame;
  const bgColor = isSelected
    ? "var(--color-accent-muted)"
    : frame.error
      ? "rgba(248, 81, 73, 0.06)"
      : CALL_TYPE_BG[frame.type] ?? "transparent";
  const borderColor = isSelected
    ? "var(--color-accent)"
    : frame.error
      ? "rgba(248, 81, 73, 0.4)"
    : CALL_TYPE_BORDER[frame.type] ?? "transparent";

  // Parse value from hex wei to PLS
  const valuePLS = (() => {
    if (!frame.value || frame.value === "0x0" || frame.value === "0") return null;
    try {
      const wei = BigInt(frame.value);
      if (wei === 0n) return null;
      const whole = wei / 10n ** 18n;
      const frac = wei % 10n ** 18n;
      if (whole > 0n) return `${whole}.${frac.toString().padStart(18, "0").slice(0, 4)}`;
      // Small amounts: show more decimals
      const fracStr = frac.toString().padStart(18, "0");
      const firstNonZero = fracStr.search(/[^0]/);
      return `0.${fracStr.slice(0, Math.max(firstNonZero + 4, 4))}`;
    } catch {
      return null;
    }
  })();

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-1.5 cursor-pointer text-xs relative whitespace-nowrap"
        onClick={() => { onJumpTo(stepIndex, funcName !== "???" ? funcName : undefined); onSelect?.(frame); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          paddingLeft: `${8 + depth * 14}px`,
          backgroundColor: bgColor,
          borderLeft: `3px solid ${borderColor}`,
          fontFamily: "var(--font-mono)",
        }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="w-4 text-center flex-shrink-0"
            style={{ color: "var(--color-text-muted)" }}
          >
            {expanded ? "▼" : "▶"}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {displayLabel && (
          <>
            <span
              style={{ color: contractName ? "var(--color-accent)" : "var(--color-text-secondary)" }}
              title={frame.to ?? ""}
            >
              {displayLabel}
            </span>
            <span style={{ color: "var(--color-text-muted)" }}>.</span>
          </>
        )}

        <span
          className="font-semibold"
          style={{ color: frame.error ? "var(--color-danger)" : "var(--color-text-primary)" }}
          title={frame.to ?? ""}
        >
          {funcName}
        </span>

        {frame.error && (
          <span
            className="flex-shrink-0 px-1"
            style={{ color: "var(--color-danger)", fontSize: "9px", fontWeight: 700 }}
            title={frame.error}
          >
            REVERT
          </span>
        )}

        {valuePLS && (
          <span className="flex-shrink-0" style={{ color: "var(--color-warning)" }}>
            {valuePLS} PLS
          </span>
        )}

        {hasChildren && (
          <span className="ml-auto flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
            ({frame.calls!.length})
          </span>
        )}

        {hovered && (
          <div
            className="absolute left-full ml-2 z-20 px-3 py-2 shadow-lg text-xs whitespace-nowrap"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              boxShadow: "inset 0 0 0 1px var(--color-border-default)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono)",
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <div style={{ color: OPCODE_COLORS[frame.type] ?? "#94A3B8" }}>{frame.type}</div>
            {resolvedSig && <div>{resolvedSig}</div>}
            {frame.to && <div style={{ color: "var(--color-text-muted)" }}>{frame.to}</div>}
            <div style={{ color: "var(--color-text-muted)" }}>gas: {frame.gasUsed}</div>
            {frame.error && <div style={{ color: "var(--color-danger)" }}>error: {frame.error}</div>}
          </div>
        )}
      </div>

      {expanded && frame.calls?.map((child, i) => (
        <CallFrameRow
          key={i}
          frame={child}
          depth={depth + 1}
          onJumpTo={onJumpTo}
          signatureMap={signatureMap}
          contractNames={contractNames}
          frameStepMap={frameStepMap}
          internalCallsByFrame={internalCallsByFrame}
          onSelect={onSelect}
          selectedFrame={selectedFrame}
        />
      ))}
      {expanded && internalCallsByFrame.get(frame)?.map((ic, i) => (
        <div
          key={`internal-${i}`}
          className="flex items-center gap-1 px-2 py-1 cursor-pointer text-xs whitespace-nowrap"
          onClick={() => onJumpTo(ic.stepIndex, ic.funcName)}
          style={{
            paddingLeft: `${8 + (depth + 1) * 14}px`,
            backgroundColor: "rgba(148, 163, 184, 0.04)",
            borderLeft: "3px solid rgba(148, 163, 184, 0.2)",
            fontFamily: "var(--font-mono)",
            opacity: 0.6,
          }}
        >
          <span className="w-4 flex-shrink-0" />
          <span style={{ color: "var(--color-text-secondary)", fontStyle: "italic" }}>
            {ic.funcName}
          </span>
          {ic.line > 0 && (
            <span style={{ color: "var(--color-text-muted)" }}>
              L{ic.line}
            </span>
          )}
        </div>
      ))}
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

// ---------------------------------------------------------------------------
// Frame detail panel — shown below call tree when a frame is selected
// ---------------------------------------------------------------------------

function FrameDetailPanel({
  frame,
  contractNames,
  signatureMap,
}: {
  frame: CallFrame;
  contractNames: Record<string, string | null>;
  signatureMap: Record<string, SignatureMatch[]>;
}) {
  const selector = frame.input?.length >= 10 ? frame.input.slice(0, 10).toLowerCase() : "";
  const contractName = frame.to ? contractNames[frame.to.toLowerCase()] : null;
  const wk = selector ? lookupWellKnown(selector) : undefined;
  const sigMatch = selector ? signatureMap[selector]?.[0]?.textSignature : undefined;
  const resolvedSig = wk?.signature ?? sigMatch;

  return (
    <div
      className="card-divider px-3 py-2 text-xs space-y-1 overflow-auto"
      style={{ backgroundColor: "var(--color-bg-secondary)", maxHeight: "120px" }}
    >
      <div className="flex gap-4">
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>type </span>
          <span style={{ color: OPCODE_COLORS[frame.type] ?? "var(--color-text-primary)" }}>{frame.type}</span>
        </div>
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>gas </span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{parseInt(frame.gasUsed).toLocaleString()}</span>
        </div>
        {frame.value && frame.value !== "0x0" && frame.value !== "0" && (
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>value </span>
            <span style={{ color: "var(--color-warning)", fontFamily: "var(--font-mono)" }}>{frame.value}</span>
          </div>
        )}
      </div>

      {frame.from && (
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>from </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{frame.from}</span>
        </div>
      )}

      {frame.to && (
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>to </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}>
            {contractName ? `${contractName} ` : ""}{frame.to}
          </span>
        </div>
      )}

      {resolvedSig && (
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>sig </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{resolvedSig}</span>
        </div>
      )}

      {frame.input && frame.input.length > 10 && (
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>input </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", wordBreak: "break-all" }}>
            {frame.input}
          </span>
        </div>
      )}

      {frame.output && (
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>output </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", wordBreak: "break-all" }}>
            {frame.output}
          </span>
        </div>
      )}

      {frame.error && (
        <div>
          <span style={{ color: "var(--color-danger)" }}>error </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-danger)" }}>{frame.error}</span>
        </div>
      )}
    </div>
  );
}

