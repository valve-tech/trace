import { pool } from "../pool.js";

/**
 * Mined-tx traces are deterministic and immutable, so the result of any
 * `debug_traceTransaction` / `callTracer` / struct-log run can be cached
 * forever on the (tx_hash, trace_type) tuple. Reads are best-effort —
 * a DB hiccup returns null and the caller falls through to a fresh RPC.
 */
export async function getCachedTrace<T>(
  txHash: string,
  traceType: string,
): Promise<T | null> {
  try {
    const { rows } = await pool.query<{ result: T }>(
      "SELECT result FROM trace_cache WHERE tx_hash = $1 AND trace_type = $2",
      [txHash.toLowerCase(), traceType],
    );
    return rows[0]?.result ?? null;
  } catch {
    return null;
  }
}

/**
 * Track in-flight cache writes so a graceful shutdown can await them.
 * Trace responses don't wait on the cache write (see the `void
 * setCachedTrace(...)` call sites in the public-API files) — that's
 * intentional to avoid adding DB latency to the response. The tradeoff is
 * that a SIGTERM during a write would drop the cache entry; this Set lets
 * the shutdown handler call `awaitPendingCacheWrites()` to drain pending
 * writes before exit.
 */
const pendingCacheWrites = new Set<Promise<void>>();

/** Resolve once every in-flight cache write has settled (succeeded or failed). */
export async function awaitPendingCacheWrites(): Promise<void> {
  if (pendingCacheWrites.size === 0) return;
  await Promise.allSettled([...pendingCacheWrites]);
}

export async function setCachedTrace(
  txHash: string,
  traceType: string,
  result: unknown,
): Promise<void> {
  const write = (async () => {
    try {
      await pool.query(
        `INSERT INTO trace_cache (tx_hash, trace_type, result)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (tx_hash, trace_type) DO UPDATE SET result = $3::jsonb, created_at = NOW()`,
        [txHash.toLowerCase(), traceType, JSON.stringify(result)],
      );
    } catch (err) {
      console.error("[tracer] cache write failed:", err);
    }
  })();
  pendingCacheWrites.add(write);
  write.finally(() => pendingCacheWrites.delete(write));
  return write;
}
