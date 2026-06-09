/**
 * One-shot ERC-20 metadata (decimals + symbol) for the transfer watcher.
 *
 * The transfer matcher (`matchErc20Transfer`) is pure and renders whatever raw
 * value it's handed. This module is the SINGLE effect that turns a token address
 * into the decimals/symbol needed to show "1.5 USDC" instead of "1500000". It
 * rides the same bring-your-own-RPC client the subscriptions use (`getPublicClient`),
 * so the read lands on the user's node, never Explore's proxy.
 *
 * Memoized per (chainId, token): a token is read at most once per session no
 * matter how many rules — or how many re-subscriptions — reference it. `decimals()`
 * is required (a token that can't answer it isn't usable for human amounts);
 * `symbol()` is best-effort. A FAILED read is evicted rather than cached, so a
 * transient RPC hiccup self-heals on the next transfer instead of poisoning the
 * token's display for the rest of the session.
 */

import { parseAbiItem } from "viem";
import { getPublicClient } from "./client.js";
import type { TokenMeta } from "./matchers.js";

const DECIMALS_ABI = parseAbiItem("function decimals() view returns (uint8)");
const SYMBOL_ABI = parseAbiItem("function symbol() view returns (string)");

/** In-flight or resolved metadata per `${chainId}|${lowercased token}`. */
const cache = new Map<string, Promise<TokenMeta | null>>();

function cacheKey(chainId: number, address: string): string {
  return `${chainId}|${address.toLowerCase()}`;
}

/**
 * Resolve a token's decimals (+ optional symbol), memoized per chain+token.
 * Returns `null` when the token can't answer `decimals()` (not an ERC-20, or
 * the RPC failed) — the caller falls back to raw base units. The null result is
 * NOT cached, so a later transfer of the same token retries the read.
 */
export function getTokenMeta(
  chainId: number,
  address: string,
): Promise<TokenMeta | null> {
  const key = cacheKey(chainId, address);
  const existing = cache.get(key);
  if (existing) return existing;

  const pending = fetchTokenMeta(chainId, address);
  cache.set(key, pending);
  // Self-heal: drop a failed read so the next event re-attempts it. A success
  // (decimals are immutable) stays cached for the life of the session.
  void pending.then((meta) => {
    if (meta === null) cache.delete(key);
  });
  return pending;
}

async function fetchTokenMeta(
  chainId: number,
  address: string,
): Promise<TokenMeta | null> {
  const client = getPublicClient(chainId);
  const token = address as `0x${string}`;
  let decimals: number;
  try {
    const raw = await client.readContract({
      address: token,
      abi: [DECIMALS_ABI],
      functionName: "decimals",
    });
    decimals = Number(raw);
  } catch {
    return null; // no decimals() → can't render a human amount; show raw.
  }

  // Symbol is a nicety, not a requirement — a token with decimals but no
  // symbol() still renders a scaled amount, just without the ticker.
  let symbol: string | undefined;
  try {
    symbol =
      (await client.readContract({
        address: token,
        abi: [SYMBOL_ABI],
        functionName: "symbol",
      })) || undefined;
  } catch {
    symbol = undefined;
  }

  return { decimals, symbol };
}

/** Drop all memoized metadata — used by tests and on hard endpoint resets. */
export function resetTokenMeta(): void {
  cache.clear();
}
