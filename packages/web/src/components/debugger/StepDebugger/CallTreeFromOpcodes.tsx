import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { OpcodeStep, CallFrame } from "../../../api/debugger";
import type { SourceLocation, SourceFile } from "../../../api/source";
import type { SignatureMatch } from "../../../api/signatures";
import { PanelHeader } from "./PanelHeader";
import { TreeNode, type TreeShared } from "./TreeNode";
import { FrameDetailPanel } from "./FrameDetailPanel";
import { buildExecutionTree, filterExecutionTree, type LogsByStep } from "./executionScopes";
import { flattenVisible, resolveTreeKey } from "./treeKeyboard";
import { TreeFilterBar } from "./TreeFilterBar";
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
  sourcesByAddr,
  treeStateKey,
  onExpandFrame,
  inline,
}: {
  steps: OpcodeStep[];
  onJumpTo: (step: number, hint?: { funcName: string; contractAddr?: string }) => void;
  signatureMap: Record<string, SignatureMatch[]>;
  frameStepMap: Map<CallFrame, number>;
  traceSourceMaps: Record<string, Record<number, SourceLocation | null>>;
  callTrace?: CallFrame | null;
  contractNames: Record<string, string | null>;
  abiSelectors: Record<string, Record<string, string>>;
  logsByStep?: LogsByStep;
  /** Per-contract source files (lower-cased address keys) for naming internal
   *  functions and distinguishing library calls. */
  sourcesByAddr?: Record<string, SourceFile[]>;
  /** Stable key (the tx hash) the persisted expand/collapse state is scoped to. */
  treeStateKey?: string | null;
  onExpandFrame?: (frame: CallFrame, entryStep: number, label: string) => void;
  inline?: boolean;
}) {
  const [selectedFrame, setSelectedFrame] = useState<CallFrame | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Tree filters: node-kind toggles (internal fns, library fns, events) plus
  // the set of opcodes to surface as leaves. Opcodes default off — the tree
  // stays lean until you ask for them.
  const [showInternal, setShowInternal] = useState(true);
  const [showLibrary, setShowLibrary] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [enabledOps, setEnabledOps] = useState<Set<string>>(() => new Set());
  const toggleOp = useCallback((op: string) => {
    setEnabledOps((prev) => {
      const next = new Set(prev);
      if (next.has(op)) next.delete(op);
      else next.add(op);
      return next;
    });
  }, []);

  // Persisted expand/collapse overrides, scoped to the transaction. We store
  // only the rows the user explicitly toggled (deviations from the depth-based
  // default), keyed by the stable nodeKey so they reattach after a reload.
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>(() =>
    treeStateKey ? loadTreeExpandState(treeStateKey) : {},
  );
  // Mount-only: sweep localStorage entries for transactions we no longer
  // care about. The "reload overrides on tx change" path the parent used to
  // need is gone — StepDebugger keys its subtree on txHash, so this whole
  // component remounts when tx changes and the useState initializer above
  // reloads from storage naturally.
  useEffect(() => {
    pruneStaleTreeState();
  }, []);
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
  // nesting, interleaved in execution order. Rebuilds when the opcode set
  // changes (opcodes add/remove leaf nodes); the cheaper function/event toggles
  // are applied as a post-filter below without rebuilding.
  const builtTree = useMemo(
    () =>
      callTrace
        ? buildExecutionTree(callTrace, frameStepMap, steps, traceSourceMaps, logsByStep, enabledOps, sourcesByAddr)
        : null,
    [callTrace, frameStepMap, steps, traceSourceMaps, logsByStep, enabledOps, sourcesByAddr],
  );
  const tree = useMemo(
    () =>
      builtTree
        ? filterExecutionTree(builtTree, { internal: showInternal, library: showLibrary, events: showEvents })
        : null,
    [builtTree, showInternal, showLibrary, showEvents],
  );

  // Expose the filtered (rendered) tree for the dev nav audit (stripped from prod).
  useEffect(() => {
    if (import.meta.env.DEV) publishNavTree(tree);
  }, [tree]);

  // ---- Keyboard navigation ----
  // The pane is focusable; while it holds focus the arrow keys drive the tree
  // (expand/collapse + move) rather than the scrubber. The visible-row list is
  // built with the same expand rule the rows render with, so they stay in sync.
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleRows = useMemo(
    () => (tree ? flattenVisible(tree, expandedOverrides) : []),
    [tree, expandedOverrides],
  );
  const scrollRowIntoView = useCallback((key: string) => {
    // rAF so the row exists after an expand toggle re-renders the list.
    requestAnimationFrame(() =>
      containerRef.current
        ?.querySelector(`[data-node-key="${key}"]`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }, []);
  const focusRow = useCallback(
    (key: string) => {
      setSelectedKey(key);
      scrollRowIntoView(key);
    },
    [scrollRowIntoView],
  );
  // Clicking a row focuses the pane so arrows take over immediately (no second
  // click), and keeps the selection highlight as the focus indicator.
  const selectOnClick = useCallback((key: string) => {
    setSelectedKey(key);
    containerRef.current?.focus({ preventScroll: true });
  }, []);
  const onTreeKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const action = resolveTreeKey(e.key, visibleRows, selectedKey);
      if (!action) return;
      e.preventDefault(); // arrows/space would otherwise scroll the pane
      if (action.type === "focus") focusRow(action.key);
      else if (action.type === "toggle") onToggleExpand(action.key, action.expanded);
      else
        (
          containerRef.current?.querySelector(
            `[data-node-key="${action.key}"]`,
          ) as HTMLElement | null
        )?.click();
    },
    [visibleRows, selectedKey, focusRow, onToggleExpand],
  );

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
      onSelectKey: selectOnClick,
      onExpand: onExpandFrame,
    };
    const content = <TreeNode node={tree} depth={0} shared={shared} />;

    if (inline) return content;

    return (
      <div className="card overflow-hidden flex flex-col h-full">
        <PanelHeader title="Call Tree" count={callTrace.calls?.length ?? 0} suffix="calls" />
        <TreeFilterBar
          internal={showInternal}
          library={showLibrary}
          events={showEvents}
          onToggleInternal={() => setShowInternal((v) => !v)}
          onToggleLibrary={() => setShowLibrary((v) => !v)}
          onToggleEvents={() => setShowEvents((v) => !v)}
          enabledOps={enabledOps}
          onToggleOp={toggleOp}
        />
        <div
          ref={containerRef}
          tabIndex={0}
          data-debugger-tree
          onKeyDown={onTreeKeyDown}
          className="overflow-auto flex-1"
          style={{ outline: "none" }}
        >
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
  if (inline) return <div className="text-xs p-2 theme-text-muted">No call tree</div>;
  return (
    <div className="card overflow-hidden flex flex-col h-full">
      <PanelHeader title="Call Tree" count={0} suffix="calls" />
      <div className="p-3 text-xs text-center theme-text-muted">No call tree available</div>
    </div>
  );
}
