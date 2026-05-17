import type { TraceFrame } from "../types.js";
import { walkCallTree } from "./walkCallTree.js";

/**
 * Find the innermost frame that reverted — the deepest frame in the tree with
 * either an `error` or a `revertReason`. Returns null if no frame reverted.
 *
 * "Innermost" matters because reverts bubble up: a deep contract call reverts,
 * its parent re-throws, and so on up the tree. The root frame's error often
 * reflects the original cause, but the deepest one carries the precise
 * `revertReason` string.
 */
export function findRevertFrame(root: TraceFrame): TraceFrame | null {
  let deepest: TraceFrame | null = null;
  let deepestDepth = -1;

  walkCallTree(root, {
    enter: (frame, depth) => {
      if ((frame.error || frame.revertReason) && depth > deepestDepth) {
        deepest = frame;
        deepestDepth = depth;
      }
    },
  });

  return deepest;
}
