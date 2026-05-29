import { decodeFunctionData, type Hex } from "viem";
import type { CallFrame } from "../tracer.js";
import { fetchAbi } from "../decoder.js";
import type { FlatGasEntry, GasEntry, GasProfile } from "./types.js";

/**
 * Try to decode the function selector at the start of `input` against
 * the ABI of `address`. Falls back to the raw 4-byte selector, then to
 * "(fallback)" when there's no input data at all (plain ETH transfer).
 */
async function decodeFunctionName(
  input: string,
  address: string,
): Promise<string> {
  if (!input || input === "0x" || input.length < 10) return "(fallback)";

  const selector = input.slice(0, 10);

  try {
    const abi = await fetchAbi(address);
    if (abi) {
      const { functionName } = decodeFunctionData({
        abi,
        data: input as Hex,
      });
      return functionName;
    }
  } catch {
    // ABI decode failed — just use the selector.
  }

  return selector;
}

/** Hex-or-decimal string → number, defaulting to 0 on malformed input. */
function parseGas(val: string | number | undefined): number {
  if (val === undefined) return 0;
  if (typeof val === "number") return val;
  return parseInt(val, val.startsWith("0x") ? 16 : 10) || 0;
}

async function buildGasEntry(
  frame: CallFrame,
  totalTxGas: number,
  depth: number,
): Promise<GasEntry> {
  const gasUsed = parseGas(frame.gasUsed);

  // Walk children AND resolve this frame's function name in parallel. The
  // serial-await loop this replaced was the cause of "gas profile never
  // finishes" on traces with many unverified contracts — each fetchAbi has
  // a 10s timeout, and a chain of 100 frames waiting one-by-one compounds
  // into minutes. With parallelism, the wall-clock is bounded by the
  // depth-weighted longest serial path plus one fetchAbi window.
  const [childEntries, funcName] = await Promise.all([
    frame.calls
      ? Promise.all(frame.calls.map((c) => buildGasEntry(c, totalTxGas, depth + 1)))
      : Promise.resolve([] as GasEntry[]),
    decodeFunctionName(frame.input, frame.to),
  ]);

  const childrenGas = childEntries.reduce((sum, c) => sum + c.totalGas, 0);
  const selfGas = Math.max(0, gasUsed - childrenGas);

  return {
    function: funcName,
    address: frame.to,
    callType: frame.type ?? "CALL",
    gasUsed: selfGas,
    totalGas: gasUsed,
    percentage: totalTxGas > 0 ? (gasUsed / totalTxGas) * 100 : 0,
    depth,
    children: childEntries,
  };
}

function flattenEntries(entries: GasEntry[]): FlatGasEntry[] {
  const flat: FlatGasEntry[] = [];

  function walk(entry: GasEntry): void {
    flat.push({
      depth: entry.depth,
      function: entry.function,
      address: entry.address,
      callType: entry.callType,
      gasUsed: entry.totalGas,
      percentage: entry.percentage,
    });
    for (const child of entry.children) walk(child);
  }

  for (const entry of entries) walk(entry);

  flat.sort((a, b) => b.gasUsed - a.gasUsed);
  return flat;
}

function aggregateByCallType(entries: GasEntry[]): Record<string, number> {
  const result: Record<string, number> = {};

  function walk(entry: GasEntry): void {
    const type = entry.callType;
    result[type] = (result[type] ?? 0) + entry.gasUsed;
    for (const child of entry.children) walk(child);
  }

  for (const entry of entries) walk(entry);
  return result;
}

/**
 * Produce a hierarchical + flat gas profile from a call-tree trace.
 * The flat list is sorted by total gas descending so the table view
 * shows the worst offenders first.
 */
export async function profileGas(
  callTrace: CallFrame,
): Promise<GasProfile> {
  const totalGas = parseGas(callTrace.gasUsed);
  const rootEntry = await buildGasEntry(callTrace, totalGas, 0);
  const entries = [rootEntry];
  const flat = flattenEntries(entries);
  const byCallType = aggregateByCallType(entries);

  return { totalGas, entries, flat, byCallType };
}
