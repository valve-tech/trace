import type {
  AnalyzeRisksOptions,
  RiskFlag,
  TraceFrame,
} from "../types.js";
import { walkCallTree } from "../traversal/walkCallTree.js";
import { BUILTIN_RULES } from "./rules.js";

/**
 * Walk a call tree and emit risk findings. The walk continues into reverted
 * subtrees — findings from those frames are tagged with `reverted: true`
 * so consumers can filter them out if they only want on-chain effects.
 * For security audits, "this delegatecall was almost made" is meaningful
 * even if the surrounding call later reverted.
 *
 * Pass `whitelist` to suppress findings against known-good contracts (e.g.
 * proxy implementations you've audited). Output ordering reflects pre-order
 * traversal of the call tree, with all rules applied at each frame in
 * registration order.
 */
export function analyzeRisks(
  root: TraceFrame,
  options: AnalyzeRisksOptions = {},
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  // Count of reverted ancestors currently on the DFS stack. Incremented
  // in `enter` for any frame with an error, decremented on `exit` so the
  // counter unwinds with the stack.
  let revertedAncestors = 0;

  walkCallTree(root, {
    enter(frame, depth, childIndex) {
      const inReverted = revertedAncestors > 0 || !!frame.error;
      for (const rule of BUILTIN_RULES) {
        const flag = rule(frame, depth, childIndex, options);
        if (flag) flags.push({ ...flag, reverted: inReverted });
      }
      if (frame.error) revertedAncestors++;
    },
    exit(frame) {
      if (frame.error) revertedAncestors--;
    },
  });

  return flags;
}
