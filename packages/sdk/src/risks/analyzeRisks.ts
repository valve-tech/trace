import type {
  AnalyzeRisksOptions,
  RiskFlag,
  TraceFrame,
} from "../types.js";
import { walkCallTree } from "../traversal/walkCallTree.js";
import { BUILTIN_RULES, type RiskRule } from "./rules.js";
import { BUILTIN_RULE_DEFS, type Rule } from "./defineRule.js";

/**
 * Accepted shapes for `options.rules`: either bare run-functions (the
 * historical `RiskRule[]` shape) or metadata-bearing `Rule` objects from
 * `defineRule(...)`. Mix freely — the analyzer normalizes both forms before
 * invocation.
 */
export type AnalyzableRule = RiskRule | Rule;

/**
 * Superset of `AnalyzeRisksOptions` that adds the `rules` override. Kept
 * local to this module to avoid a cycle (`types.ts` is the foundation; the
 * risks module imports from it, not the other way around).
 */
export type AnalyzeRisksOptionsWithRules = AnalyzeRisksOptions & {
  rules?: readonly AnalyzableRule[];
};

function isRule(r: AnalyzableRule): r is Rule {
  return typeof r !== "function";
}

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
 *
 * `options.rules` overrides the default rule set (`BUILTIN_RULE_DEFS`) and
 * accepts either bare `RiskRule` functions or `Rule` objects from
 * `defineRule(...)`. Pass `[...BUILTIN_RULE_DEFS, myCustomRule]` to extend the
 * defaults; pass a subset to filter them.
 */
export function analyzeRisks(
  root: TraceFrame,
  options: AnalyzeRisksOptionsWithRules = {},
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const ruleFns: RiskRule[] = (options.rules ?? BUILTIN_RULE_DEFS).map((r) =>
    isRule(r) ? r.run : r,
  );
  // Count of reverted ancestors currently on the DFS stack. Incremented
  // in `enter` for any frame with an error, decremented on `exit` so the
  // counter unwinds with the stack.
  let revertedAncestors = 0;

  walkCallTree(root, {
    enter(frame, depth, childIndex) {
      const inReverted = revertedAncestors > 0 || !!frame.error;
      for (const rule of ruleFns) {
        for (const flag of rule(frame, depth, childIndex, options)) {
          flags.push({ ...flag, reverted: inReverted });
        }
      }
      if (frame.error) revertedAncestors++;
    },
    exit(frame) {
      if (frame.error) revertedAncestors--;
    },
  });

  return flags;
}

// Re-export to keep `BUILTIN_RULES` reachable through this module after the
// shape split — older code that imported it from analyzeRisks's neighborhood
// continues to work.
export { BUILTIN_RULES };
