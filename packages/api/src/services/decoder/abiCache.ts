import type { Abi } from "viem";

/**
 * One hour. Long enough to amortize repeat lookups inside a single
 * user's session; short enough that re-verified contracts and
 * proxy-implementation upgrades don't strand stale ABIs for days.
 */
const ABI_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Cap entries to bound memory. JS Map preserves insertion order, so the
 * oldest key evicts on cross-over — simple FIFO, close enough to LRU
 * for this workload (timestamp gates expiry separately).
 */
const ABI_CACHE_MAX_ENTRIES = 500;

interface AbiCacheEntry {
  abi: Abi;
  /** Epoch millis at insert / refresh. */
  t: number;
}

const abiCache = new Map<string, AbiCacheEntry>();

export function readCachedAbi(key: string): Abi | null {
  const entry = abiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.t > ABI_CACHE_TTL_MS) {
    abiCache.delete(key);
    return null;
  }
  return entry.abi;
}

export function writeCachedAbi(key: string, abi: Abi): void {
  abiCache.set(key, { abi, t: Date.now() });
  if (abiCache.size > ABI_CACHE_MAX_ENTRIES) {
    const oldest = abiCache.keys().next().value;
    if (oldest !== undefined) abiCache.delete(oldest);
  }
}

/**
 * Drop an entry (or the entire cache when no address given). Call this
 * after a contract is re-verified, after a proxy upgrade, or from an
 * admin endpoint that wants to force a re-fetch.
 */
export function invalidateAbiCache(address?: string): void {
  if (address === undefined) {
    abiCache.clear();
    return;
  }
  abiCache.delete(address.toLowerCase());
}

/** Test helper. */
export function _getAbiCacheSize(): number {
  return abiCache.size;
}
