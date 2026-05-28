import { nodeKey, type ExecNode } from "./executionScopes";
import { isRowExpanded } from "./TreeNode";

/** A row as it appears in the rendered tree, in top-to-bottom display order. */
export interface VisibleRow {
  key: string;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  parentKey: string | null;
}

/**
 * Flatten the tree to exactly the rows currently on screen — a child appears
 * only under an expanded parent — in display order. This is the list arrow-key
 * navigation walks, and it uses the same `isRowExpanded` the rows render with,
 * so the keyboard's notion of "what's visible" can't drift from the DOM.
 */
export function flattenVisible(
  root: ExecNode,
  overrides: Record<string, boolean> | undefined,
): VisibleRow[] {
  const out: VisibleRow[] = [];
  const walk = (node: ExecNode, depth: number, parentKey: string | null) => {
    const key = nodeKey(node);
    const children = node.kind === "log" ? [] : node.children;
    const expandable = children.length > 0;
    const expanded = expandable && isRowExpanded(key, depth, overrides);
    out.push({ key, depth, expandable, expanded, parentKey });
    if (expanded) for (const c of children) walk(c, depth + 1, key);
  };
  walk(root, 0, null);
  return out;
}

/** What an arrow/enter key should do, resolved against the visible rows. */
export type KeyAction =
  | { type: "focus"; key: string }
  | { type: "toggle"; key: string; expanded: boolean }
  | { type: "activate"; key: string };

/**
 * Map a key press to a tree action (or null to leave it to the browser):
 *   ↑/↓        move the focused row
 *   →          expand a collapsed row, else step into the first child
 *   ←          collapse an expanded row, else jump to the parent
 *   Enter/Space activate the row (same as a click)
 * Standard tree-widget semantics, so it reads the way users expect.
 */
export function resolveTreeKey(
  key: string,
  rows: VisibleRow[],
  selectedKey: string | null,
): KeyAction | null {
  if (rows.length === 0) return null;
  const idx = selectedKey ? rows.findIndex((r) => r.key === selectedKey) : -1;
  const cur = idx >= 0 ? rows[idx]! : undefined;

  switch (key) {
    case "ArrowDown":
      return { type: "focus", key: rows[Math.min(idx + 1, rows.length - 1)]!.key };
    case "ArrowUp":
      return { type: "focus", key: rows[idx <= 0 ? 0 : idx - 1]!.key };
    case "ArrowRight":
      if (!cur) return { type: "focus", key: rows[0]!.key };
      if (cur.expandable && !cur.expanded) return { type: "toggle", key: cur.key, expanded: true };
      if (cur.expanded && idx + 1 < rows.length) return { type: "focus", key: rows[idx + 1]!.key };
      return null;
    case "ArrowLeft":
      if (!cur) return { type: "focus", key: rows[0]!.key };
      if (cur.expandable && cur.expanded) return { type: "toggle", key: cur.key, expanded: false };
      if (cur.parentKey) return { type: "focus", key: cur.parentKey };
      return null;
    case "Enter":
    case " ":
      return cur ? { type: "activate", key: cur.key } : null;
    default:
      return null;
  }
}
