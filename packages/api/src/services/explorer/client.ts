/**
 * Low-level BlockScout HTTP client shared by every `getX` function in this
 * directory. Centralizes the per-chain base URL, fetch timeout, and
 * BigInt→string serialization that the explorer surface needs.
 */

import { currentChain } from "../chains/context.js";

/**
 * The active chain's BlockScout API base (classic v1 `/api` endpoint), or
 * `null` when the chain has no BlockScout configured (e.g. Ethereum in the
 * default registry). Callers must treat `null` as "this data source does
 * not exist here" and degrade, not error.
 */
export function blockscoutBase(): string | null {
  return currentChain().blockscoutBase ?? null;
}

/**
 * The BlockScout v2 REST base for the active chain (the `/api/v2/...`
 * family), or `null` when the chain has no BlockScout.
 */
export function blockscoutV2Base(): string | null {
  const base = blockscoutBase();
  return base === null ? null : base.replace("/api", "");
}

/**
 * Call BlockScout's classic v1 API for the active chain and return parsed
 * JSON, or `null` on any failure (no BlockScout on this chain, network
 * error, non-2xx response, JSON parse error). Returning null instead of
 * throwing lets callers fall back to viem/publicClient data without
 * try/catch noise at every call site.
 *
 * 15s timeout — generous to absorb cold cache misses on BlockScout, but
 * bounded so a stuck request doesn't pin a route handler.
 */
export async function blockscoutFetch<T = unknown>(
  params: Record<string, string>,
): Promise<T | null> {
  const base = blockscoutBase();
  if (base === null) return null;
  try {
    const qs = new URLSearchParams(params).toString();
    const url = `${base}?${qs}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Recursively coerce BigInts to strings so the value is JSON-serializable.
 * Express's `res.json` throws on BigInt; many viem fields (block.number,
 * tx.value, gasUsed, etc.) come back as BigInt. Use this on any object
 * returned by viem before sending it through the wire.
 */
export function serialize(val: unknown): unknown {
  if (typeof val === "bigint") return val.toString();
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(serialize);
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = serialize(v);
    }
    return out;
  }
  return val;
}
