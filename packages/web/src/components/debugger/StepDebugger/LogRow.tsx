import { Icon } from "@iconify/react";
import { nodeKey, type ExecNode } from "./executionScopes";
import type { TreeShared } from "./TreeNode";

/**
 * One emitted event (a LOG0–LOG4 opcode) in the execution tree. A leaf row,
 * styled distinctly from calls/functions so events stand out as side effects.
 * `name` is the decoded event signature when the receipt gave us one, else the
 * raw opcode (LOG2, …). Clicking jumps to the LOG step.
 */
export function LogRow({
  node,
  depth,
  shared,
}: {
  node: Extract<ExecNode, { kind: "log" }>;
  depth: number;
  shared: TreeShared;
}) {
  // Decoded events read like `Transfer(address,address,uint256)`; show just the
  // event name as the headline and keep the param list as a muted suffix.
  const paren = node.name.indexOf("(");
  const eventName = paren > 0 ? node.name.slice(0, paren) : node.name;
  const params = paren > 0 ? node.name.slice(paren) : null;
  const key = nodeKey(node);
  const isSelected = shared.selectedKey === key;

  return (
    <div
      data-node-key={key}
      className="flex items-center gap-tight pr-2 py-1 cursor-pointer text-xs whitespace-nowrap"
      onClick={() => { shared.onJumpTo(node.step); shared.onSelectKey?.(key); }}
      style={{
        fontFamily: "var(--font-mono)",
        backgroundColor: isSelected ? "var(--color-accent-muted)" : undefined,
        boxShadow: isSelected ? "inset 2px 0 0 0 var(--color-accent)" : undefined,
      }}
    >
      {Array.from({ length: depth }, (_, g) => (
        <span
          key={g}
          className="self-stretch flex-shrink-0"
          style={{ width: "14px", boxShadow: "inset 1px 0 0 0 var(--color-border-muted)", marginLeft: g === 0 ? "6px" : 0 }}
        />
      ))}

      <span className="w-4 flex items-center justify-center flex-shrink-0 theme-warning">
        <Icon icon="heroicons:megaphone" className="w-3 h-3" />
      </span>

      <span style={{ color: "var(--color-warning)" }}>{eventName}</span>
      {params && (
        <span className="truncate" style={{ color: "var(--color-text-muted)", maxWidth: "320px" }}>
          {params}
        </span>
      )}
      <span
        className="flex-shrink-0 text-[9px] font-semibold tracking-wide px-1 py-0.5"
        style={{ color: "var(--color-text-muted)", boxShadow: "inset 0 0 0 1px var(--color-border-muted)" }}
        title={`${node.topicCount} indexed topic${node.topicCount === 1 ? "" : "s"}`}
      >
        LOG{node.topicCount}
      </span>
    </div>
  );
}
