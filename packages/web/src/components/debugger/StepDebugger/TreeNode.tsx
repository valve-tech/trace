import type { CallFrame } from "../../../api/debugger";
import type { SignatureMatch } from "../../../api/signatures";
import type { ExecNode } from "./executionScopes";
import { CallFrameRow } from "./CallFrameRow";
import { ScopeRow } from "./ScopeRow";

/** Props shared by every node in the execution tree, threaded down unchanged. */
export interface TreeShared {
  onJumpTo: (step: number, funcName?: string) => void;
  signatureMap: Record<string, SignatureMatch[]>;
  contractNames: Record<string, string | null>;
  abiSelectors: Record<string, Record<string, string>>;
  onSelect?: (frame: CallFrame) => void;
  selectedFrame?: CallFrame | null;
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
  return node.kind === "call" ? (
    <CallFrameRow node={node} depth={depth} shared={shared} />
  ) : (
    <ScopeRow node={node} depth={depth} shared={shared} />
  );
}
