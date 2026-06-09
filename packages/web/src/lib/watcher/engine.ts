/**
 * The viem wiring for a single watch rule. This is the ONLY file that touches
 * viem's subscription primitives; it adapts their block/log shapes into the
 * minimal inputs the pure matchers expect, and forwards every produced match to
 * `onMatch`. Returns the unsubscribe function viem hands back, so the engine
 * hook can reconcile subscriptions as rules change.
 *
 * Errors are swallowed (logged, not thrown): a transient RPC hiccup on the
 * user's node shouldn't tear down the watch — viem keeps polling and recovers.
 */

import { parseAbiItem } from "viem";
import { getPublicClient } from "./client.js";
import {
  matchAddressActivity,
  matchErc20Transfer,
} from "./matchers.js";
import type { WatchMatchContent, WatchRule } from "./types.js";
import { isRuleActionable } from "./rules.js";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

export type MatchHandler = (rule: WatchRule, content: WatchMatchContent) => void;

/** No-op unsubscribe, returned when a rule isn't actionable yet. */
const NOOP = () => {};

/**
 * Open a subscription for `rule`, invoking `onMatch` for each fired match.
 * Idempotent contract: call the returned function to tear it down. A rule
 * missing its required condition (no address / no token) yields a no-op so the
 * caller doesn't special-case it.
 */
export function subscribeRule(rule: WatchRule, onMatch: MatchHandler): () => void {
  if (!isRuleActionable(rule)) return NOOP;
  const client = getPublicClient(rule.chainId);

  if (rule.kind === "address_activity") {
    return client.watchBlocks({
      includeTransactions: true,
      emitMissed: true,
      onBlock: (block) => {
        const txs = block.transactions.map((t) => ({
          hash: t.hash,
          from: t.from,
          to: t.to,
          value: t.value,
        }));
        for (const content of matchAddressActivity(txs, rule, block.number)) {
          onMatch(rule, content);
        }
      },
      onError: (err) => console.warn("[watcher] watchBlocks error", err),
    });
  }

  // erc20_transfer — poll-based so it rides eth_getLogs (which the /rpc proxy
  // supports) instead of eth_newFilter (which it may not).
  return client.watchEvent({
    address: rule.contractAddress as `0x${string}`,
    event: TRANSFER_EVENT,
    poll: true,
    onLogs: (logs) => {
      for (const log of logs) {
        const content = matchErc20Transfer(
          {
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
            from: log.args.from ?? "0x",
            to: log.args.to ?? "0x",
            value: log.args.value ?? 0n,
          },
          rule,
        );
        if (content) onMatch(rule, content);
      }
    },
    onError: (err) => console.warn("[watcher] watchEvent error", err),
  });
}

/**
 * A stable string identity for a rule's subscription. Two rules with the same
 * signature produce an identical subscription, so the engine can skip
 * re-subscribing when an unrelated rule changes. Includes every field that
 * affects what's watched (but NOT `label` or `id`, which don't).
 */
export function ruleSignature(rule: WatchRule): string {
  return [
    rule.id,
    rule.chainId,
    rule.kind,
    rule.enabled ? "1" : "0",
    rule.address ?? "",
    rule.direction ?? "",
    rule.contractAddress ?? "",
    rule.counterparty ?? "",
  ].join("|");
}
