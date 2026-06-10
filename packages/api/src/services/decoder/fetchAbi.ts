import type { Abi } from "viem";
import { readCachedAbi, writeCachedAbi } from "./abiCache.js";
import { currentChain, currentChainId } from "../chains/context.js";

// Coalesce concurrent fetches for the same address. The gas profiler walks
// the call tree in parallel and routinely fires 100s of decodeFunctionName
// calls at once — without this map, every parallel caller for the same
// address fires its own BlockScout request and each waits the full 10s
// timeout on an unverified contract.
const inflight = new Map<string, Promise<Abi | null>>();

/**
 * Fetch the ABI for a verified contract from the active chain's BlockScout.
 * Returns `null` when the chain has no BlockScout configured, the contract
 * is not verified, the request times out, or the response is malformed.
 * Results are cached in memory keyed by (chainId, address) with a one-hour
 * TTL (see `./abiCache.ts`); concurrent callers share one in-flight request
 * per (chainId, address).
 */
export async function fetchAbi(address: string): Promise<Abi | null> {
  const blockscoutBase = currentChain().blockscoutBase;
  if (!blockscoutBase) return null;
  const key = `${currentChainId()}:${address.toLowerCase()}`;

  const cached = readCachedAbi(key);
  if (cached) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const url = `${blockscoutBase}?module=contract&action=getabi&address=${address}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;

      const json = (await res.json()) as {
        status: string;
        result: string;
        message?: string;
      };

      if (json.status !== "1" || typeof json.result !== "string") return null;

      const abi: Abi = JSON.parse(json.result);
      writeCachedAbi(key, abi);
      return abi;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/**
 * Resolve an ABI for a simulation. User-supplied ABI wins; falls back to
 * a BlockScout fetch keyed on `toAddress`. Returns `null` when neither
 * is available.
 */
export async function resolveAbi(
  userAbi: unknown | undefined,
  toAddress: string | undefined,
): Promise<Abi | null> {
  if (userAbi) {
    try {
      if (typeof userAbi === "string") return JSON.parse(userAbi) as Abi;
      if (Array.isArray(userAbi)) return userAbi as Abi;
    } catch {
      // Fall through to BlockScout.
    }
  }

  if (toAddress) return fetchAbi(toAddress);
  return null;
}
