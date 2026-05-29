import { Icon } from "@iconify/react";
import { nodeKey, type ExecNode } from "./executionScopes";
import { TreeNode, isRowExpanded, type TreeShared } from "./TreeNode";

/**
 * One internal Solidity function (`fn` node of the execution tree). Its
 * children — nested internal functions AND the external calls it made — render
 * back through TreeNode, so a function that performs a CALL shows that call
 * nested inside it. Clicking jumps to where the function was entered.
 */
export function ScopeRow({
  node,
  depth,
  shared,
}: {
  node: Extract<ExecNode, { kind: "fn" }>;
  depth: number;
  shared: TreeShared;
}) {
  const key = nodeKey(node);
  const expanded = isRowExpanded(key, depth, shared.expandedOverrides);
  const hasChildren = node.children.length > 0;
  const isSelected = shared.selectedKey === key;

  return (
    <div>
      <div
        data-node-key={key}
        className={`flex items-center gap-tight pr-2 py-1 cursor-pointer text-xs whitespace-nowrap theme-mono${isSelected ? " theme-accent-bg" : ""}`}
        onClick={() => { shared.onJumpTo(node.entryStep); shared.onSelectKey?.(key); }}
        style={{
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

        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); shared.onToggleExpand?.(key, !expanded); }}
            className="w-4 flex items-center justify-center flex-shrink-0 theme-text-muted"
          >
            <Icon icon={expanded ? "heroicons:chevron-down" : "heroicons:chevron-right"} className="w-3 h-3" />
          </button>
        ) : (
          <span className="w-4 flex items-center justify-center flex-shrink-0 theme-text-muted">
            <Icon icon="heroicons:arrow-turn-down-right" className="w-3 h-3" />
          </span>
        )}

        <span className="theme-text-secondary" style={{ fontStyle: "italic" }}>{node.name}</span>
        {node.line > 0 && (
          <span className="theme-text-muted">L{node.line}</span>
        )}
      </div>

      {expanded && node.children.map((child, i) => (
        <TreeNode key={i} node={child} depth={depth + 1} shared={shared} />
      ))}
    </div>
  );
}
