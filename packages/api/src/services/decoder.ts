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
// In-memory ABI cache
// ---------------------------------------------------------------------------

const abiCache = new Map<string, Abi>();

// ---------------------------------------------------------------------------
// BlockScout ABI fetcher
// ---------------------------------------------------------------------------

const BLOCKSCOUT_API =
  process.env.BLOCKSCOUT_API_URL || "https://api.scan.pulsechain.com/api";

/**
 * Fetch the ABI for a verified contract from PulseChain BlockScout.
 * Returns `null` when the contract is not verified or unreachable.
 * Results are cached in memory for the lifetime of the process.
 */
export async function fetchAbi(address: string): Promise<Abi | null> {
  const key = address.toLowerCase();

  if (abiCache.has(key)) {
    return abiCache.get(key)!;
  }

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
    abiCache.set(key, abi);
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
