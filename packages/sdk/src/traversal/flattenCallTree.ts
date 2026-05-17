import type { TraceFrame } from "../types.js";
import { walkCallTree } from "./walkCallTree.js";

export interface FlatFrame {
  frame: TraceFrame;
  depth: number;
  /** Position in pre-order traversal — root is 0. */
  preOrderIndex: number;
  /** Index among this frame's siblings (0 for root). */
  siblingIndex: number;
}

/**
 * Flatten a call tree into a pre-order array. Each entry carries the depth
 * and indices needed to reconstruct the tree visually (e.g. for a call-tree
 * table) without recursion at render time.
 */
export function flattenCallTree(root: TraceFrame): FlatFrame[] {
  const out: FlatFrame[] = [];
  let preOrderIndex = 0;

  walkCallTree(root, {
    enter: (frame, depth, siblingIndex) => {
      out.push({
        frame,
        depth,
        preOrderIndex: preOrderIndex++,
        siblingIndex,
      });
    },
  });

  return out;
}
