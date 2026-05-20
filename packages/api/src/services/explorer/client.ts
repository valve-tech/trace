/**
 * Low-level BlockScout HTTP client shared by every `getX` function in this
 * directory. Centralizes the base URL, fetch timeout, and BigInt→string
 * serialization that the explorer surface needs.
 */

export const BLOCKSCOUT_API =
  process.env.BLOCKSCOUT_API_URL || "https://api.scan.pulsechain.com/api";

/**
 * Call BlockScout's classic v1 API and return parsed JSON, or `null` on any
 * failure (network error, non-2xx response, JSON parse error). Returning
 * null instead of throwing lets callers fall back to viem/publicClient data
 * without try/catch noise at every call site.
 *
 * 15s timeout — generous to absorb cold cache misses on BlockScout, but
 * bounded so a stuck request doesn't pin a route handler.
 */
export async function blockscoutFetch<T = unknown>(
  params: Record<string, string>,
): Promise<T | null> {
  try {
    const qs = new URLSearchParams(params).toString();
    const url = `${BLOCKSCOUT_API}?${qs}`;
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
