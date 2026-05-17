import type { Hex } from "viem";
import type { TraceFrame } from "../types.js";
import { walkCallTree } from "./walkCallTree.js";

/**
 * Return all frames whose calldata begins with the given 4-byte function
 * selector. Selector may be passed with or without the leading `0x`.
 * Comparison is case-insensitive.
 */
export function filterBySelector(root: TraceFrame, selector: Hex | string): TraceFrame[] {
  const normalized = (
    selector.toLowerCase().startsWith("0x") ? selector.toLowerCase() : `0x${selector.toLowerCase()}`
  );
  if (normalized.length !== 10) {
    throw new Error(
      `filterBySelector: selector must be 4 bytes (10 chars including 0x), got "${normalized}"`,
    );
  }

  const out: TraceFrame[] = [];

  walkCallTree(root, {
    enter: (frame) => {
      if (frame.input.toLowerCase().startsWith(normalized)) {
        out.push(frame);
      }
    },
  });

  return out;
}
