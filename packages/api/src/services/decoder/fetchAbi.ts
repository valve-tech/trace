import type { Abi } from "viem";
import { readCachedAbi, writeCachedAbi } from "./abiCache.js";
import { getVerifiedSource, type VerifiedSource } from "../sourceCode.js";
import { currentChainId } from "../chains/context.js";

/** Injection seam for unit tests — production always uses getVerifiedSource. */
export interface FetchAbiDeps {
  getVerifiedSource: (address: string) => Promise<VerifiedSource | null>;
}

const defaultDeps: FetchAbiDeps = { getVerifiedSource };

// Coalesce concurrent fetches for the same address. The gas profiler walks
// the call tree in parallel and routinely fires 100s of decodeFunctionName
// calls at once — without this map, every parallel caller for the same
// address fires its own verification lookup and each waits the full
// timeout on an unverified contract.
const inflight = new Map<string, Promise<Abi | null>>();

/**
 * Fetch the ABI for a verified contract via the verified-source service
 * (Sourcify-first, DB-cached; see sourceCode/getVerifiedSource). Returns
 * `null` when the contract isn't verified anywhere or the upstreams are
 * unavailable. Results are additionally memoized in memory keyed by
 * (chainId, address) with a one-hour TTL (see `./abiCache.ts`); concurrent
 * callers share one in-flight request per (chainId, address).
 */
export async function fetchAbi(
  address: string,
  deps: FetchAbiDeps = defaultDeps,
): Promise<Abi | null> {
  const key = `${currentChainId()}:${address.toLowerCase()}`;

  const cached = readCachedAbi(key);
  if (cached) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const source = await deps.getVerifiedSource(address);
      if (!source || !Array.isArray(source.abi) || source.abi.length === 0) {
        return null;
      }
      const abi = source.abi as Abi;
      writeCachedAbi(key, abi);
      return abi;
    } catch {
      // UpstreamError (both verification sources down) — decode without an
      // ABI rather than failing the caller.
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
 * a verified-source lookup keyed on `toAddress`. Returns `null` when
 * neither is available.
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
      // Fall through to the verified-source lookup.
    }
  }

  if (toAddress) return fetchAbi(toAddress);
  return null;
}
