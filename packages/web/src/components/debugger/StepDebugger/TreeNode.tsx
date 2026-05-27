import type { CallFrame } from "../../../api/debugger";
import type { SignatureMatch } from "../../../api/signatures";
import type { ExecNode } from "./executionScopes";
import { CallFrameRow } from "./CallFrameRow";
import { ScopeRow } from "./ScopeRow";
import { LogRow } from "./LogRow";

/**
 * Default depth to auto-expand the unified tree to. In this tree an external
 * CALL nests inside the internal function that made it (e.g. `safeTransferFrom`
 * → `CODA.transferFrom` → `_transferFrom`), so a frame's internal functions sit
 * 1–2 levels below it. Expanding to 5 reveals the first layer of internals
 * under each top-level call without unrolling the deep SafeMath chains.
 */
export const DEFAULT_EXPAND_DEPTH = 5;

/** Props shared by every node in the execution tree, threaded down unchanged. */
export interface TreeShared {
  onJumpTo: (step: number, funcName?: string) => void;
  signatureMap: Record<string, SignatureMatch[]>;
  contractNames: Record<string, string | null>;
  abiSelectors: Record<string, Record<string, string>>;
  onSelect?: (frame: CallFrame) => void;
  selectedFrame?: CallFrame | null;
  /** Key of the currently-selected row (any kind), for the "you are here"
   *  highlight that persists after a click. */
  selectedKey?: string | null;
  onSelectKey?: (key: string) => void;
  /** Persisted expand/collapse overrides by node key. A key present here wins
   *  over the depth-based default, so a user's collapse/expand survives reload. */
  expandedOverrides?: Record<string, boolean>;
  onToggleExpand?: (key: string, expanded: boolean) => void;
  onExpand?: (frame: CallFrame, entryStep: number, label: string) => void;
}

/**
 * Render one unified execution-tree node: a `call` (external frame) renders as
 * a CallFrameRow, an `fn` (internal Solidity function) as a ScopeRow. Both
 * render their children back through here, so calls and functions nest freely.
 */
export function TreeNode({
  node,
  depth,
  shared,
}: {
  node: ExecNode;
  depth: number;
  shared: TreeShared;
}) {
  switch (node.kind) {
    case "call":
      return <CallFrameRow node={node} depth={depth} shared={shared} />;
    case "fn":
      return <ScopeRow node={node} depth={depth} shared={shared} />;
    case "log":
      return <LogRow node={node} depth={depth} shared={shared} />;
  }
}
