import type { Address } from "viem";
import type { TraceFrame } from "../types.js";
import { walkCallTree } from "./walkCallTree.js";

export interface AddressMatchOptions {
  /** Match frames where this address is `from`. Default: true. */
  matchFrom?: boolean;
  /** Match frames where this address is `to`. Default: true. */
  matchTo?: boolean;
}

/**
 * Return all frames where the given address appears as `from`, `to`, or both
 * (per options). Comparison is case-insensitive. The returned array is in
 * pre-order traversal order.
 */
export function filterByAddress(
  root: TraceFrame,
  address: Address,
  options: AddressMatchOptions = {},
): TraceFrame[] {
  const target = address.toLowerCase();
  const matchFrom = options.matchFrom ?? true;
  const matchTo = options.matchTo ?? true;
  const out: TraceFrame[] = [];

  walkCallTree(root, {
    enter: (frame) => {
      const fromMatch = matchFrom && frame.from.toLowerCase() === target;
      const toMatch =
        matchTo && frame.to !== null && frame.to.toLowerCase() === target;
      if (fromMatch || toMatch) {
        out.push(frame);
      }
    },
  });

  return out;
}
