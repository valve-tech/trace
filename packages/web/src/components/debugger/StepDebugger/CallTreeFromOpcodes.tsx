import { useMemo, useState } from "react";
import { isCallOp } from "@valve-tech/trace-sdk/hooks";
import type { OpcodeStep, CallFrame } from "../../../api/debugger";
import type { SourceLocation } from "../../../api/source";
import type { SignatureMatch } from "../../../api/signatures";
import { PanelHeader } from "./PanelHeader";
import { CallFrameRow } from "./CallFrameRow";
import { FrameDetailPanel } from "./FrameDetailPanel";
import { walkCallTree } from "./callTreeHelpers";
import { mapFramesToSteps } from "./callTreeModel";
import type { InternalCall } from "./types";

/**
 * Sidebar tree built from the structured callTrace, augmented with internal
 * function jumps detected in the opcode stream. Each row maps back to a step
 * index via the pre-computed `frameStepMap` so clicks can scrub the debugger.
 */
export function CallTreeFromOpcodes({
  steps,
  onJumpTo,
  signatureMap,
  sourceMappings,
  callTrace,
  contractNames,
  abiSelectors,
  onExpandFrame,
  inline,
}: {
  steps: OpcodeStep[];
  onJumpTo: (step: number, funcName?: string) => void;
  signatureMap: Record<string, SignatureMatch[]>;
  sourceMappings: Record<number, SourceLocation | null>;
  callTrace?: CallFrame | null;
  contractNames: Record<string, string | null>;
  abiSelectors: Record<string, Record<string, string>>;
  onExpandFrame?: (frame: CallFrame, entryStep: number, label: string) => void;
  inline?: boolean;
}) {
  // Map each CallFrame to its opcode step index by opcode DEPTH (authoritative)
  // rather than counting CALL ops — see callTreeModel.ts. Tested in isolation
  // (callTreeModel.test.ts) against STATICCALL/DELEGATECALL/codeless cases.
  const frameStepMap = useMemo(
    () => (callTrace ? mapFramesToSteps(callTrace, steps) : new Map<CallFrame, number>()),
    [callTrace, steps],
  );

  // Detect internal Solidity function calls: JUMPs the (structure-gated)
  // source map marks as jumpType "i". The old PC-proportional name guesser
  // was dropped — it emitted wrong names (e.g. `feeToSetter`, `allPairs`) that
  // made the tree untrustworthy. We only surface calls the source map names.
  const internalCallsByFrame = useMemo((): Map<CallFrame, InternalCall[]> => {
    const internals = new Map<CallFrame, InternalCall[]>();
    if (!callTrace) return internals;

    walkCallTree(callTrace, (frame) => {
      const start = frameStepMap.get(frame) ?? 0;

      // This frame's opcode range: from its start to the next external call or
      // a return to a shallower depth.
      const end = (() => {
        for (let i = start + 1; i < steps.length; i++) {
          if (isCallOp(steps[i]!.op)) return i;
          if (i > 0 && steps[i]!.depth < steps[start]!.depth) return i;
        }
        return steps.length;
      })();

      const internalList: InternalCall[] = [];
      for (let i = start; i < end; i++) {
        const s = steps[i];
        if (!s || s.op !== "JUMP") continue;

        const mapping = sourceMappings[s.pc];
        if (mapping?.jumpType === "i") {
          const snippet = mapping.sourceSnippet.trim();
          const match = snippet.match(/(\w+)\s*\(/);
          const funcName = match?.[1] ?? "internal";
          internalList.push({ stepIndex: i, funcName, line: mapping.line });
        }
      }
      if (internalList.length > 0) internals.set(frame, internalList);
    });
    return internals;
  }, [callTrace, steps, sourceMappings, frameStepMap]);

  const [selectedFrame, setSelectedFrame] = useState<CallFrame | null>(null);

  if (callTrace) {
    const content = (
      <CallFrameRow
        frame={callTrace}
        depth={0}
        onJumpTo={onJumpTo}
        signatureMap={signatureMap}
        contractNames={contractNames}
        abiSelectors={abiSelectors}
        frameStepMap={frameStepMap}
        internalCallsByFrame={internalCallsByFrame}
        onSelect={setSelectedFrame}
        selectedFrame={selectedFrame}
        onExpand={onExpandFrame}
      />
    );

    if (inline) return content;

    return (
      <div className="card overflow-hidden flex flex-col h-full">
        <PanelHeader title="Call Tree" count={callTrace.calls?.length ?? 0} suffix="calls" />
        <div className="overflow-auto flex-1">
          <div style={{ minWidth: "fit-content" }}>
            {content}
          </div>
        </div>
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
