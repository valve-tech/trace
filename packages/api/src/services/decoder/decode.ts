import {
  decodeEventLog,
  decodeFunctionData,
  decodeFunctionResult,
  type Abi,
  type AbiEvent,
  type AbiFunction,
  type Hex,
  type Log,
} from "viem";
import type {
  DecodedEvent,
  DecodedFunction,
  DecodedOutput,
  DecodedParam,
} from "../../types.js";

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

/** Recursively convert BigInt values to strings so the result is JSON-safe. */
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

/** Decode calldata (transaction `data` field) using the provided ABI. */
export function decodeInput(data: Hex, abi: Abi): DecodedFunction | null {
  try {
    const { functionName, args } = decodeFunctionData({ abi, data });

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

/** Decode the raw return data of a successful eth_call. */
export function decodeOutput(
  data: Hex,
  abi: Abi,
  functionName: string,
): DecodedOutput | null {
  try {
    const result = decodeFunctionResult({ abi, functionName, data });

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

/** Decode an array of raw EVM logs using the provided ABI. */
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

      const argValues = Object.values(
        (args ?? {}) as unknown as Record<string, unknown>,
      );

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
