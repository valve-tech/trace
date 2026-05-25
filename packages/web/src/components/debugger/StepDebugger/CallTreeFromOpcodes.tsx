import { useMemo, useState } from "react";
import { isCallOp } from "@valve-tech/trace-sdk/hooks";
import type { OpcodeStep, CallFrame } from "../../../api/debugger";
import type { SourceLocation, ContractSource } from "../../../api/source";
import type { SignatureMatch } from "../../../api/signatures";
import { PanelHeader } from "./PanelHeader";
import { CallFrameRow } from "./CallFrameRow";
import { FrameDetailPanel } from "./FrameDetailPanel";
import { extractSourceFunctions, resolveFuncNameByProportion } from "./sourceFuncResolver";
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
  // Pre-compute: map each CallFrame to its opcode step index.
  // Also detect internal function calls (JUMP with jumpType "i" from source map).
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

        // Only surface internal calls we could actually name — the unnamed
        // `fn@<pc>` heuristic entries are noise that make the tree unreadable.
        if (funcName) internalList.push({ stepIndex: i, funcName, line: 0 });
      }
      if (internalList.length > 0) internals.set(frame, internalList);
    }
    assignSteps(callTrace, true);
    return { frameStepMap: map, internalCallsByFrame: internals };
  }, [callTrace, steps, sourceMappings, sourceData]);

  const [selectedFrame, setSelectedFrame] = useState<CallFrame | null>(null);

  if (callTrace) {
    const content = (
      <CallFrameRow
        frame={callTrace}
        depth={0}
        onJumpTo={onJumpTo}
        signatureMap={signatureMap}
        contractNames={contractNames}
        frameStepMap={frameStepMap}
        internalCallsByFrame={internalCallsByFrame}
        onSelect={setSelectedFrame}
        selectedFrame={selectedFrame}
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
