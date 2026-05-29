import { nodeKey, type ExecNode } from "./executionScopes";
import type { TreeShared } from "./TreeNode";

/**
 * One toggled-in opcode (e.g. SSTORE, TSTORE) in the execution tree. A leaf,
 * styled distinctly from calls/functions/events so surfaced opcodes scan as
 * raw machine ops. Clicking jumps to its step, so the source pane lands on the
 * line that executed it (the opcode has no body of its own).
 */
export function OpRow({
  node,
  depth,
  shared,
}: {
  node: Extract<ExecNode, { kind: "op" }>;
  depth: number;
  shared: TreeShared;
}) {
  const key = nodeKey(node);
  const isSelected = shared.selectedKey === key;

  return (
    <div
      data-node-key={key}
      className={`flex items-center gap-tight pr-2 py-1 cursor-pointer text-xs whitespace-nowrap theme-mono${isSelected ? " theme-accent-bg bs-l-accent-in" : ""}`}
      onClick={() => { shared.onJumpTo(node.step); shared.onSelectKey?.(key); }}
    >
      {Array.from({ length: depth }, (_, g) => (
        <span
          key={g}
          className="self-stretch flex-shrink-0 bs-l-in-muted"
          style={{ width: "14px", marginLeft: g === 0 ? "6px" : 0 }}
        />
      ))}

      <span
        className="w-4 flex items-center justify-center flex-shrink-0 text-[10px] font-semibold theme-text-muted"
      >
        ⛁
      </span>

      <span
        className="text-[10px] font-semibold tracking-wide px-1 py-0.5 theme-accent"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-accent-muted)" }}
      >
        {node.op}
      </span>
      <span className="theme-text-muted">@ pc {node.pc}</span>
    </div>
  );
}
