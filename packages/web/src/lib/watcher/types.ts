/**
 * Client-side watcher: watch rules + fired matches.
 *
 * A watch rule is a per-workspace, browser-local subscription to on-chain
 * activity. It runs entirely client-side (viem `watchBlocks` / `watchEvent`
 * over the bring-your-own-RPC seam, see `lib/rpcEndpoint.ts`) and only while a
 * tab is open — there is no server component, by design: the watch list and the
 * read pattern never leave the browser, and the polling cost lands on the
 * user's own RPC (their node or provider key), not on Explore.
 *
 * Two storage blobs, both companions to the Workspace store (which stays at its
 * own `schemaVersion: 1`, untouched):
 *   - `WatchRuleStore` — the user's rules.
 *   - `WatchLogStore`  — a capped ring buffer of fired matches, so the activity
 *      survives navigation and both the toast surface and the workspace panel
 *      read the same source.
 */

/** What a rule watches. Both kinds are feasible with only an RPC endpoint. */
export type WatchRuleKind = "address_activity" | "erc20_transfer";

/** For `address_activity`: which side of a transfer the watched address is on. */
export type WatchDirection = "in" | "out" | "both";

export interface WatchRule {
  /** Stable ID — React list key + reconciliation key for subscriptions. */
  id: string;
  /** The workspace this rule belongs to (rules group under their workspace). */
  workspaceId: string;
  /** EIP-155 chain the rule watches; drives which RPC endpoint is resolved. */
  chainId: number;
  kind: WatchRuleKind;
  /** Subscriptions are only opened for enabled rules; toggling is cheap. */
  enabled: boolean;
  /** Optional display name; falls back to a kind-derived label. */
  label?: string;

  // -- address_activity conditions --------------------------------------------
  /** The watched account (matched against tx `from`/`to`). Lower-cased. */
  address?: string;
  /** Which direction counts as a hit. Defaults to "both". */
  direction?: WatchDirection;

  // -- erc20_transfer conditions ----------------------------------------------
  /** The token contract whose `Transfer` events we watch. Lower-cased. */
  contractAddress?: string;
  /** Optional counterparty filter — only transfers touching this address. */
  counterparty?: string;

  createdAt: number;
}

export interface WatchRuleStore {
  schemaVersion: 1;
  rules: WatchRule[];
}

export const EMPTY_RULE_STORE: WatchRuleStore = {
  schemaVersion: 1,
  rules: [],
};

/**
 * The matcher-produced payload, BEFORE the engine stamps identity/time. Keeping
 * matchers free of `id`/`at` (and of viem types) is what makes them pure and
 * trivially unit-testable — the engine wraps this into a full `WatchMatch`.
 */
export interface WatchMatchContent {
  /** Human-readable one-liner shown in the toast + activity log. */
  summary: string;
  /** Deep-link target (/tx/:hash) when the match is tied to a transaction. */
  txHash?: string;
  /** Decimal block number string, for context in the log. */
  blockNumber?: string;
}

export interface WatchMatch extends WatchMatchContent {
  /** Unique per fired event. */
  id: string;
  ruleId: string;
  workspaceId: string;
  chainId: number;
  kind: WatchRuleKind;
  /** Snapshot of the rule's display label at fire time. */
  label: string;
  /** ms epoch. */
  at: number;
}

export interface WatchLogStore {
  schemaVersion: 1;
  /** Newest-first, capped at WATCH_LOG_CAP. */
  matches: WatchMatch[];
}

export const EMPTY_LOG_STORE: WatchLogStore = {
  schemaVersion: 1,
  matches: [],
};

/** Keep the on-chain activity log bounded — it's an ambient feed, not an archive. */
export const WATCH_LOG_CAP = 100;

/** Default display label when a rule has no user-supplied one. */
export function ruleLabel(rule: WatchRule): string {
  if (rule.label?.trim()) return rule.label.trim();
  if (rule.kind === "address_activity") return "Address activity";
  return "Token transfers";
}
