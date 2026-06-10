import { UpstreamError, type VerifiedSource } from "./types.js";
import { cacheSource, getCachedSource } from "./cache.js";
import { fetchFromBlockScout } from "./blockscout.js";
import { fetchFromSourcify } from "./sourcify.js";
import { currentChainId } from "../chains/context.js";

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
 * cache → BlockScout fetch → Sourcify fallback.
 *
 * Returns `null` only when at least one upstream **definitively answered
 * "not verified"** for this address — that result is safe to negative-cache.
 * Throws `UpstreamError` when both upstreams were transiently unavailable
 * (5xx / network / timeout) so we don't poison the cache during outages and
 * the route can surface a real 503 instead of a misleading 404.
 */
export async function getVerifiedSource(
  address: string,
): Promise<VerifiedSource | null> {
  const key = `${currentChainId()}:${address.toLowerCase()}`;

  const notFoundAt = NOT_FOUND_CACHE.get(key);
  if (notFoundAt && Date.now() - notFoundAt < NOT_FOUND_TTL) {
    return null;
  }

  const cached = await getCachedSource(address);
  if (cached) return cached;

  // Track whether each upstream gave a definitive answer ("null" return) or
  // failed transiently (UpstreamError). We only poison the negative cache when
  // BOTH answered definitively — otherwise an outage cements as a 10-min lie.
  let blockscoutAnswered = false;
  try {
    const blockscoutResult = await fetchFromBlockScout(address);
    blockscoutAnswered = true;
    if (blockscoutResult) {
      await cacheSource(blockscoutResult).catch((err) => {
        console.error("[sourceCode] cache write failed:", err);
      });
      NOT_FOUND_CACHE.delete(key);
      return blockscoutResult;
    }
  } catch (err) {
    if (!(err instanceof UpstreamError)) throw err;
    console.warn(`[sourceCode] blockscout unavailable for ${address}: ${err.message}`);
  }

  let sourcifyAnswered = false;
  try {
    const sourcifyResult = await fetchFromSourcify(address);
    sourcifyAnswered = true;
    if (sourcifyResult) {
      await cacheSource(sourcifyResult).catch((err) => {
        console.error("[sourceCode] cache write failed:", err);
      });
      NOT_FOUND_CACHE.delete(key);
      return sourcifyResult;
    }
  } catch (err) {
    if (!(err instanceof UpstreamError)) throw err;
    console.warn(`[sourceCode] sourcify unavailable for ${address}: ${err.message}`);
  }

  if (blockscoutAnswered && sourcifyAnswered) {
    // Both upstreams definitively said "not here" — safe to cache the miss.
    NOT_FOUND_CACHE.set(key, Date.now());
    return null;
  }

  // At least one upstream was unavailable. Don't lie about "not verified" and
  // don't cement the answer; let the route raise a 503 the user can retry.
  throw new UpstreamError(
    blockscoutAnswered ? "sourcify" : sourcifyAnswered ? "blockscout" : "blockscout+sourcify",
    "verification upstreams unavailable",
  );
}
