import type { TraceFrame } from "../types.js";

export interface WalkVisitor {
  /**
   * Called when entering a frame, before any of its children. Return `false`
   * to stop the entire walk; return `"skip"` to skip this frame's children
   * (the exit hook still fires).
   */
  enter?: (frame: TraceFrame, depth: number, index: number) => void | false | "skip";
  /**
   * Called when leaving a frame, after all children have been visited. Return
   * `false` to stop the entire walk.
   */
  exit?: (frame: TraceFrame, depth: number, index: number) => void | false;
}

interface StackEntry {
  frame: TraceFrame;
  depth: number;
  index: number;
  childIndex: number;
  entered: boolean;
  skipChildren: boolean;
}

/**
 * Depth-first walk of a call tree using an explicit stack. Safe for
 * arbitrarily deep trees (will not blow the JS call stack).
 *
 * `index` is the position among the parent's children (0 for the root).
 */
export function walkCallTree(root: TraceFrame, visitor: WalkVisitor): void {
  const stack: StackEntry[] = [
    {
      frame: root,
      depth: 0,
      index: 0,
      childIndex: 0,
      entered: false,
      skipChildren: false,
    },
  ];

  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;

    if (!top.entered) {
      top.entered = true;
      if (visitor.enter) {
        const ret = visitor.enter(top.frame, top.depth, top.index);
        if (ret === false) return;
        if (ret === "skip") top.skipChildren = true;
      }
    }

    if (!top.skipChildren && top.childIndex < top.frame.children.length) {
      const child = top.frame.children[top.childIndex]!;
      const ci = top.childIndex;
      top.childIndex++;
      stack.push({
        frame: child,
        depth: top.depth + 1,
        index: ci,
        childIndex: 0,
        entered: false,
        skipChildren: false,
      });
      continue;
    }

    if (visitor.exit) {
      const ret = visitor.exit(top.frame, top.depth, top.index);
      if (ret === false) return;
    }
    stack.pop();
  }
}
