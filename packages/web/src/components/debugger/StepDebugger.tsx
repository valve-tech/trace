import { useState, useEffect, useCallback, useMemo } from "react";
import { isCallOp, isStorageOp, isLogOp } from "@valve-tech/trace-sdk/hooks";
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
  const [currentStep, setCurrentStep] = useState(0);
  const [opcodeFilter, setOpcodeFilter] = useState("");
  const [contentView, setContentView] = useState<"trace" | "opcodes" | "source">("source");
  const [slitherFindings, setSlitherFindings] = useState<SlitherFinding[]>([]);
  const [slitherLoading, setSlitherLoading] = useState(false);
  const [showFindings, setShowFindings] = useState(false);
  const [overrideLine, setOverrideLine] = useState<number | null>(null);
  const [pendingFuncSearch, setPendingFuncSearch] = useState<string | null>(null);
  const [scrollKey, setScrollKey] = useState(0);

  const totalSteps = steps.length;

  const maxDepth = useMemo(() => {
    let max = 1;
    for (const s of steps) if (s.depth > max) max = s.depth;
    return max;
  }, [steps]);

  const filteredIndices = useMemo(() => {
    if (!opcodeFilter) return null;
    const upper = opcodeFilter.toUpperCase();
    const indices: number[] = [];
    for (let i = 0; i < steps.length; i++) {
      if (steps[i]!.op.includes(upper)) indices.push(i);
    }
    return indices;
  }, [opcodeFilter, steps]);

  // Reset on new trace
  useEffect(() => {
    setCurrentStep(0);
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
  const goTo = useCallback(
    (step: number) => setCurrentStep(Math.max(0, Math.min(step, totalSteps - 1))),
    [totalSteps],
  );

  const stepForward = useCallback(() => { setOverrideLine(null); goTo(currentStep + 1); }, [currentStep, goTo]);
  const stepBackward = useCallback(() => { setOverrideLine(null); goTo(currentStep - 1); }, [currentStep, goTo]);

  // Jump to a step, switch to Source, and try to scroll to the function
  // definition. `funcName` lets the call tree pass the resolved name directly.
  const jumpToAndShowSource = useCallback(
    (step: number, funcName?: string) => {
      goTo(step);
      setContentView("source");
      setScrollKey((k) => k + 1);
      if (funcName) setPendingFuncSearch(funcName);
    },
    [goTo],
  );

  const jumpToNext = useCallback(
    (predicate: (op: string) => boolean): void => {
      setOverrideLine(null);
      for (let i = currentStep + 1; i < totalSteps; i++) {
        if (predicate(steps[i]!.op)) { goTo(i); return; }
      }
    },
    [currentStep, totalSteps, steps, goTo],
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
    const curr = step.storage;
    const prev = prevStep?.storage ?? {};
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
        <div className="hidden lg:block w-[280px] flex-shrink-0 sticky top-0 self-start" style={{ maxHeight: "calc(100vh - 200px)" }}>
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
          <div className="flex border-b" style={{ borderColor: "var(--color-border-default)" }}>
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
            <OpcodesTraceView
              steps={steps}
              currentStep={currentStep}
              goTo={goTo}
              filteredIndices={filteredIndices}
              maxDepth={maxDepth}
            />
          )}

          {contentView === "source" && (
            <SourceTabContent
              currentSourceFile={currentSourceFile}
              effectiveLine={effectiveLine}
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
