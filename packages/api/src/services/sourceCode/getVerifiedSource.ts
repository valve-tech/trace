import type { VerifiedSource } from "./types.js";
import { cacheSource, getCachedSource } from "./cache.js";
import { fetchFromBlockScout } from "./blockscout.js";
import { fetchFromSourcify } from "./sourcify.js";

/**
 * In-memory negative cache for addresses confirmed unverified. 10-min
 * TTL because contracts can get verified later — we don't want to lie
 * for too long. Lives at module scope so it survives across requests
 * inside one process.
 */
const NOT_FOUND_CACHE = new Map<string, number>();
const NOT_FOUND_TTL = 10 * 60 * 1000;

/**
 * Resolve verified source for an address. Walks: negative cache → DB
 * cache → BlockScout fetch → Sourcify fallback. Returns `null` if no
 * source can be produced; stores that miss in the negative cache so
 * repeated lookups don't hammer both upstreams.
 */
export async function getVerifiedSource(
  address: string,
): Promise<VerifiedSource | null> {
  const key = address.toLowerCase();

  const notFoundAt = NOT_FOUND_CACHE.get(key);
  if (notFoundAt && Date.now() - notFoundAt < NOT_FOUND_TTL) {
    return null;
  }

  const cached = await getCachedSource(address);
  if (cached) return cached;

  const blockscoutResult = await fetchFromBlockScout(address);
  if (blockscoutResult) {
    await cacheSource(blockscoutResult).catch((err) => {
      console.error("[sourceCode] cache write failed:", err);
    });
    NOT_FOUND_CACHE.delete(key);
    return blockscoutResult;
  }

  const sourcifyResult = await fetchFromSourcify(address);
  if (sourcifyResult) {
    await cacheSource(sourcifyResult).catch((err) => {
      console.error("[sourceCode] cache write failed:", err);
    });
    NOT_FOUND_CACHE.delete(key);
    return sourcifyResult;
  }

  NOT_FOUND_CACHE.set(key, Date.now());
  return null;
}
