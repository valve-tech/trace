import { useMemo, useState } from "react";
import type { OpcodeStep, CallFrame } from "../../../api/debugger";
import type { SourceLocation } from "../../../api/source";
import type { SignatureMatch } from "../../../api/signatures";
import { PanelHeader } from "./PanelHeader";
import { TreeNode, type TreeShared } from "./TreeNode";
import { FrameDetailPanel } from "./FrameDetailPanel";
import { buildExecutionTree } from "./executionScopes";

/**
 * Sidebar tree built from the structured callTrace + per-contract source maps:
 * one unified tree where external CALLs nest inside the internal Solidity
 * function executing them (Remix's model — see executionScopes.ts). Rows map
 * back to a step index so clicks scrub the debugger.
 */
export function CallTreeFromOpcodes({
  steps,
  onJumpTo,
  signatureMap,
  frameStepMap,
  traceSourceMaps,
  callTrace,
  contractNames,
  abiSelectors,
  onExpandFrame,
  inline,
}: {
  steps: OpcodeStep[];
  onJumpTo: (step: number, funcName?: string) => void;
  signatureMap: Record<string, SignatureMatch[]>;
  frameStepMap: Map<CallFrame, number>;
  traceSourceMaps: Record<string, Record<number, SourceLocation | null>>;
  callTrace?: CallFrame | null;
  contractNames: Record<string, string | null>;
  abiSelectors: Record<string, Record<string, string>>;
  onExpandFrame?: (frame: CallFrame, entryStep: number, label: string) => void;
  inline?: boolean;
}) {
  const [selectedFrame, setSelectedFrame] = useState<CallFrame | null>(null);

  // The unified execution tree: external frames + internal functions, one
  // nesting, interleaved in execution order.
  const tree = useMemo(
    () => (callTrace ? buildExecutionTree(callTrace, frameStepMap, steps, traceSourceMaps) : null),
    [callTrace, frameStepMap, steps, traceSourceMaps],
  );

  if (callTrace && tree) {
    const shared: TreeShared = {
      onJumpTo,
      signatureMap,
      contractNames,
      abiSelectors,
      onSelect: setSelectedFrame,
      selectedFrame,
      onExpand: onExpandFrame,
    };
    const content = <TreeNode node={tree} depth={0} shared={shared} />;

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
