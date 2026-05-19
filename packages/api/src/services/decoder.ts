import {
  decodeFunctionData,
  decodeFunctionResult,
  decodeEventLog,
  type Abi,
  type Hex,
  type Log,
  type AbiFunction,
  type AbiEvent,
} from "viem";
import type { DecodedFunction, DecodedOutput, DecodedEvent, DecodedParam } from "../types.js";

// ---------------------------------------------------------------------------
// In-memory ABI cache — bounded LRU with TTL
// ---------------------------------------------------------------------------

/**
 * One hour. Long enough to amortize repeat lookups inside a single
 * user's session; short enough that re-verified contracts and
 * proxy-implementation upgrades don't strand stale ABIs for days.
 */
const ABI_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Cap entries to bound memory. JS `Map` preserves insertion order, so we
 * evict the oldest key when we cross the cap — simple FIFO eviction
 * (close enough to LRU for this workload: re-fetches refresh `entry.t`
 * but not insertion order, which is fine since the timestamp also gates
 * expiry).
 */
const ABI_CACHE_MAX_ENTRIES = 500;

interface AbiCacheEntry {
  abi: Abi;
  /** Epoch millis at insert / refresh. */
  t: number;
}

const abiCache = new Map<string, AbiCacheEntry>();

function readCachedAbi(key: string): Abi | null {
  const entry = abiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.t > ABI_CACHE_TTL_MS) {
    abiCache.delete(key);
    return null;
  }
  return entry.abi;
}

function writeCachedAbi(key: string, abi: Abi): void {
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

/** Internal helper exposed for tests. */
export function _getAbiCacheSize(): number {
  return abiCache.size;
}

// ---------------------------------------------------------------------------
// BlockScout ABI fetcher
// ---------------------------------------------------------------------------

const BLOCKSCOUT_API =
  process.env.BLOCKSCOUT_API_URL || "https://api.scan.pulsechain.com/api";

/**
 * Fetch the ABI for a verified contract from PulseChain BlockScout.
 * Returns `null` when the contract is not verified or unreachable.
 * Results are cached in memory with a one-hour TTL.
 */
export async function fetchAbi(address: string): Promise<Abi | null> {
  const key = address.toLowerCase();

  const cached = readCachedAbi(key);
  if (cached) return cached;

  try {
    const url = `${BLOCKSCOUT_API}?module=contract&action=getabi&address=${address}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return null;
    }

    const json = (await res.json()) as { status: string; result: string; message?: string };

    if (json.status !== "1" || typeof json.result !== "string") {
      return null;
    }

    const abi: Abi = JSON.parse(json.result);
    writeCachedAbi(key, abi);
    return abi;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

function toDecodedParams(
  names: readonly string[] | undefined,
  types: readonly string[],
  values: readonly unknown[],
): DecodedParam[] {
  return types.map((type, i) => ({
    name: names?.[i] ?? `param_${i}`,
    type,
    value: serializeBigInts(values[i]),
  }));
}

/**
 * Recursively convert BigInt values to strings so the result is JSON-safe.
 */
function serializeBigInts(val: unknown): unknown {
  if (typeof val === "bigint") return val.toString();
  if (Array.isArray(val)) return val.map(serializeBigInts);
  if (val !== null && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeBigInts(v);
    }
    return out;
  }
  return val;
}

/**
 * Decode calldata (transaction `data` field) using the provided ABI.
 */
export function decodeInput(data: Hex, abi: Abi): DecodedFunction | null {
  try {
    const { functionName, args } = decodeFunctionData({ abi, data });

    // Find the matching ABI entry so we can read param names / types.
    const abiItem = abi.find(
      (item): item is AbiFunction =>
        item.type === "function" && item.name === functionName,
    );

    const paramNames = abiItem?.inputs.map((i) => i.name ?? "") ?? [];
    const paramTypes = abiItem?.inputs.map((i) => i.type) ?? [];

    return {
      functionName,
      args: toDecodedParams(paramNames, paramTypes, (args ?? []) as unknown[]),
    };
  } catch {
    return null;
  }
}

/**
 * Decode the raw return data of a successful eth_call.
 */
export function decodeOutput(
  data: Hex,
  abi: Abi,
  functionName: string,
): DecodedOutput | null {
  try {
    const result = decodeFunctionResult({ abi, functionName, data });

    // `result` is the decoded value — either a single value or a tuple.
    const abiItem = abi.find(
      (item): item is AbiFunction =>
        item.type === "function" && item.name === functionName,
    );

    const outputNames = abiItem?.outputs.map((o) => o.name ?? "") ?? [];
    const outputTypes = abiItem?.outputs.map((o) => o.type) ?? [];

    // When there is a single return value, viem returns it unwrapped.
    const values = Array.isArray(result) ? result : [result];

    return {
      values: toDecodedParams(outputNames, outputTypes, values),
    };
  } catch {
    return null;
  }
}

/**
 * Decode an array of raw EVM logs using the provided ABI.
 */
export function decodeLogs(logs: Log[], abi: Abi): DecodedEvent[] {
  const decoded: DecodedEvent[] = [];

  for (const log of logs) {
    try {
      const { eventName, args } = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });

      const abiItem = abi.find(
        (item): item is AbiEvent =>
          item.type === "event" && item.name === eventName,
      );

      const paramNames = abiItem?.inputs.map((i) => i.name ?? "") ?? [];
      const paramTypes = abiItem?.inputs.map((i) => i.type) ?? [];

      const argValues = Object.values((args ?? {}) as unknown as Record<string, unknown>);

      decoded.push({
        eventName: eventName ?? "UnknownEvent",
        args: toDecodedParams(paramNames, paramTypes, argValues),
      });
    } catch {
      // Skip logs that don't match the ABI.
    }
  }

  return decoded;
}

/**
 * Attempt to resolve an ABI for a simulation request.
 * Priority: user-supplied ABI > BlockScout fetch (if `to` address provided).
 */
export async function resolveAbi(
  userAbi: unknown | undefined,
  toAddress: string | undefined,
): Promise<Abi | null> {
  // User explicitly provided an ABI.
  if (userAbi) {
    try {
      if (typeof userAbi === "string") {
        return JSON.parse(userAbi) as Abi;
      }
      if (Array.isArray(userAbi)) {
        return userAbi as Abi;
      }
    } catch {
      // Fall through to BlockScout.
    }
  }

  // Try fetching from BlockScout.
  if (toAddress) {
    return fetchAbi(toAddress);
  }

  return null;
}
