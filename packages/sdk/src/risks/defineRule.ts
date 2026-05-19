import type { RiskSeverity } from "../types.js";
import type { RiskRule } from "./rules.js";
import {
  delegatecallUnrecognized,
  largeApproval,
  tokenSentToTokenContract,
} from "./rules.js";

/**
 * Metadata-bearing wrapper around a `RiskRule`. The bare function form is what
 * the analyzer actually invokes; the surrounding fields exist so the UI can
 * group, filter, and explain findings without re-deriving structure from the
 * `RiskFlag.type` discriminator.
 *
 * `id` is the stable identifier (kebab-case). `severity` is the rule's
 * *default* severity — individual findings emitted by `run` may override it on
 * a per-finding basis (e.g. a future rule that classifies approvals
 * differently by value tier). `category` is a coarse UI grouping. `docs` is an
 * optional URL or markdown blob with detection rationale + remediation.
 */
export interface Rule {
  id: string;
  severity: RiskSeverity;
  category: string;
  title: string;
  description: string;
  docs?: string;
  run: RiskRule;
}

/**
 * Identity helper that anchors type inference at the definition site. Lets
 * consumers write `defineRule({ ... })` and get full editor IntelliSense for
 * the metadata fields, plus a single import path to migrate against if the
 * shape evolves.
 */
export function defineRule(rule: Rule): Rule {
  return rule;
}

// ---------------------------------------------------------------------------
// Built-in rule definitions
// ---------------------------------------------------------------------------

export const RULE_DELEGATECALL_UNRECOGNIZED: Rule = defineRule({
  id: "delegatecall-unrecognized",
  severity: "danger",
  category: "delegatecall",
  title: "Unrecognized DELEGATECALL target",
  description:
    "Flags any DELEGATECALL whose target is not in the supplied whitelist. " +
    "DELEGATECALL executes callee code in the caller's storage context, so " +
    "every untrusted target is a high-severity finding.",
  run: delegatecallUnrecognized,
});

export const RULE_LARGE_APPROVAL: Rule = defineRule({
  id: "large-approval",
  severity: "warning",
  category: "approval",
  title: "Large ERC-20 approval",
  description:
    "Flags ERC-20 Approval events whose value meets or exceeds the " +
    "configured threshold (default 2**256-1, the canonical unlimited " +
    "approval). Pass `largeApprovalThreshold` to also catch fake-unlimited " +
    "phishing variants.",
  run: largeApproval,
});

export const RULE_TOKEN_SENT_TO_TOKEN_CONTRACT: Rule = defineRule({
  id: "token-sent-to-token-contract",
  severity: "warning",
  category: "transfer",
  title: "ERC-20 Transfer to a token contract",
  description:
    "Flags ERC-20 Transfer events whose recipient is a token contract — " +
    "funds sent to a token's own contract address are unrecoverable. " +
    "Cross-token detection requires the `classifyAddress` option.",
  run: tokenSentToTokenContract,
});

/**
 * The metadata-bearing built-in registry. Order is preserved in
 * `analyzeRisks` output. Parallels `BUILTIN_RULES` (which is the same data in
 * bare-function form) — keep both shapes in sync when adding new rules.
 */
export const BUILTIN_RULE_DEFS: readonly Rule[] = [
  RULE_DELEGATECALL_UNRECOGNIZED,
  RULE_LARGE_APPROVAL,
  RULE_TOKEN_SENT_TO_TOKEN_CONTRACT,
];

/**
 * Look up a built-in rule by id. Returns `undefined` for unknown ids so
 * consumers can build their own merge/override logic without exception
 * handling.
 */
export function getRuleById(id: string): Rule | undefined {
  return BUILTIN_RULE_DEFS.find((r) => r.id === id);
}
