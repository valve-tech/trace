/**
 * Shared low-level helpers for the explorer services. Everything here is
 * RPC-side — the explorer no longer talks to Blockscout (verified-source
 * loading, the one sanctioned external read, lives in services/sourceCode).
 */

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
