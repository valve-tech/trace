import { useCallback, useEffect, useMemo, useState } from "react";
import type { OpcodeStep, CallFrame } from "../../../api/debugger";
import type { SourceLocation } from "../../../api/source";
import type { SignatureMatch } from "../../../api/signatures";
import { PanelHeader } from "./PanelHeader";
import { TreeNode, type TreeShared } from "./TreeNode";
import { FrameDetailPanel } from "./FrameDetailPanel";
import { buildExecutionTree, type LogsByStep } from "./executionScopes";
import { publishNavTree } from "./navDiagnostics";
import {
  loadTreeExpandState,
  saveTreeExpandState,
  pruneStaleTreeState,
} from "../../../lib/debuggerTreeState";

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
  logsByStep,
  treeStateKey,
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
  logsByStep?: LogsByStep;
  /** Stable key (the tx hash) the persisted expand/collapse state is scoped to. */
  treeStateKey?: string | null;
  onExpandFrame?: (frame: CallFrame, entryStep: number, label: string) => void;
  inline?: boolean;
}) {
  const [selectedFrame, setSelectedFrame] = useState<CallFrame | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Persisted expand/collapse overrides, scoped to the transaction. We store
  // only the rows the user explicitly toggled (deviations from the depth-based
  // default), keyed by the stable nodeKey so they reattach after a reload.
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>(() =>
    treeStateKey ? loadTreeExpandState(treeStateKey) : {},
  );
  // Reload overrides when the viewed tx changes, and sweep stale entries once.
  useEffect(() => {
    pruneStaleTreeState();
    setExpandedOverrides(treeStateKey ? loadTreeExpandState(treeStateKey) : {});
  }, [treeStateKey]);
  const onToggleExpand = useCallback(
    (key: string, expanded: boolean) => {
      setExpandedOverrides((prev) => {
        const next = { ...prev, [key]: expanded };
        if (treeStateKey) saveTreeExpandState(treeStateKey, next);
        return next;
      });
    },
    [treeStateKey],
  );

  // The unified execution tree: external frames + internal functions, one
  // nesting, interleaved in execution order.
  const tree = useMemo(
    () =>
      callTrace
        ? buildExecutionTree(callTrace, frameStepMap, steps, traceSourceMaps, logsByStep)
        : null,
    [callTrace, frameStepMap, steps, traceSourceMaps, logsByStep],
  );

  // Expose the built tree for the dev nav audit (stripped from prod bundles).
  useEffect(() => {
    if (import.meta.env.DEV) publishNavTree(tree);
  }, [tree]);

  if (callTrace && tree) {
    const shared: TreeShared = {
      onJumpTo,
      signatureMap,
      contractNames,
      abiSelectors,
      onSelect: setSelectedFrame,
      selectedFrame,
      selectedKey,
      expandedOverrides,
      onToggleExpand,
      onSelectKey: setSelectedKey,
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
