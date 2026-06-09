/**
 * Pure watch matchers — given decoded chain data + a rule, decide whether the
 * rule fires and produce the human summary. No viem types, no IDB, no clock:
 * the engine (`engine.ts`) adapts viem's block/log shapes into the minimal
 * inputs below and stamps identity/time onto the result. That split is what
 * keeps this file a bag of deterministic functions you can table-test, exactly
 * like the backend monitor's `matchers.ts`.
 */

import { formatEther } from "viem";
import type { WatchMatchContent, WatchRule } from "./types.js";

/** Just the tx fields a matcher needs (subset of viem's Transaction). */
export interface MinimalTx {
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
}

/** Just the fields a matcher needs from a decoded ERC-20 Transfer log. */
export interface MinimalTransferLog {
  transactionHash: string | null;
  blockNumber: bigint | null;
  from: string;
  to: string;
  value: bigint;
}

/** `0x1234…cdef` — compact address/hash for one-line summaries. */
export function shorten(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

// ===========================================================================
// USER-SHAPEABLE: address-activity matcher
// ---------------------------------------------------------------------------
// This is the load-bearing product decision of the watcher — "what counts as
// activity worth a notification, and how do we phrase it?" The default fires on
// any native-value transfer where the watched address is the sender and/or
// recipient (honoring the rule's direction filter + optional min-value
// threshold) and summarizes it as "0xabc… sent 1.5 → 0xdef…". Reasonable knobs
// you might still want to change:
//   - treat `to === null` (contract creation) specially, or skip it?
//   - a different summary phrasing / counterparty emphasis?
// It's a pure function with a tiny input shape, so reshaping it is safe and
// fully covered by matchers.test.ts.
// ===========================================================================
export function matchAddressActivity(
  txs: MinimalTx[],
  rule: WatchRule,
  blockNumber: bigint | null,
): WatchMatchContent[] {
  const watched = rule.address?.toLowerCase();
  if (!watched) return [];
  const direction = rule.direction ?? "both";
  // Below this many wei a tx is dust/zero-value noise and doesn't fire.
  const minValueWei = rule.minValueWei ? BigInt(rule.minValueWei) : 0n;
  const out: WatchMatchContent[] = [];

  for (const tx of txs) {
    if (tx.value < minValueWei) continue;
    const from = tx.from.toLowerCase();
    const to = tx.to?.toLowerCase() ?? null;
    const isOut = from === watched;
    const isIn = to === watched;
    const relevant =
      direction === "both" ? isOut || isIn : direction === "out" ? isOut : isIn;
    if (!relevant) continue;

    const verb = isOut && isIn ? "self-transfer of" : isOut ? "sent" : "received";
    const amount = formatEther(tx.value);
    const counterparty = isOut ? to : from;
    const tail =
      counterparty === null
        ? "(contract creation)"
        : `${isOut ? "→" : "←"} ${shorten(counterparty)}`;

    out.push({
      summary: `${shorten(watched)} ${verb} ${amount} ${tail}`.trim(),
      txHash: tx.hash,
      blockNumber: blockNumber?.toString(),
    });
  }
  return out;
}

/**
 * ERC-20 `Transfer` matcher. The rule is already scoped to one token contract
 * at the subscription layer (viem's `watchEvent({ address })`), so here we only
 * apply the optional counterparty filter and phrase the summary.
 *
 * Value is shown RAW (base units): token decimals aren't known client-side
 * without an extra `decimals()` call, and an ambient notification doesn't
 * justify one. The deep-link to the tx is where a user gets the exact amount.
 */
export function matchErc20Transfer(
  log: MinimalTransferLog,
  rule: WatchRule,
): WatchMatchContent | null {
  const counterparty = rule.counterparty?.toLowerCase();
  const from = log.from.toLowerCase();
  const to = log.to.toLowerCase();
  if (counterparty && from !== counterparty && to !== counterparty) return null;

  return {
    summary: `Transfer ${shorten(from)} → ${shorten(to)} (${log.value.toString()})`,
    txHash: log.transactionHash ?? undefined,
    blockNumber: log.blockNumber?.toString() ?? undefined,
  };
}
