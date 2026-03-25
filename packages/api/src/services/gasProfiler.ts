/**
 * Gas analysis service.
 *
 * Takes raw trace data and produces structured gas-usage breakdowns
 * for display in the debugger UI.
 */

import type { CallFrame, OpcodeStep } from "./tracer.js";
import { fetchAbi } from "./decoder.js";
import { decodeFunctionData, type Hex } from "viem";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GasEntry {
  /** Decoded function name, or the raw selector, or the call type */
  function: string;
  /** Target contract address */
  address: string;
  /** Call type: CALL, STATICCALL, DELEGATECALL, CREATE, CREATE2 */
  callType: string;
  /** Gas consumed by this specific call (excluding children) */
  gasUsed: number;
  /** Gas consumed including children */
  totalGas: number;
  /** Percentage of total transaction gas */
  percentage: number;
  /** Nesting depth in the call tree */
  depth: number;
  /** Children gas entries */
  children: GasEntry[];
}

export interface FlatGasEntry {
  depth: number;
  function: string;
  address: string;
  callType: string;
  gasUsed: number;
  percentage: number;
}

export interface GasProfile {
  totalGas: number;
  /** Hierarchical gas breakdown */
  entries: GasEntry[];
  /** Flattened for table view, sorted by gas descending */
  flat: FlatGasEntry[];
  /** Gas grouped by call type */
  byCallType: Record<string, number>;
}

export interface OpcodeCategory {
  category: string;
  gas: number;
  count: number;
  percentage: number;
}

export interface ExpensiveOp {
  step: number;
  pc: number;
  op: string;
  gasCost: number;
}

export interface OpcodeProfile {
  totalGas: number;
  /** Gas grouped by opcode category */
  categories: OpcodeCategory[];
  /** Top N most expensive individual operations */
  topExpensive: ExpensiveOp[];
}

// ---------------------------------------------------------------------------
// Opcode category mapping
// ---------------------------------------------------------------------------

const OPCODE_CATEGORIES: Record<string, string> = {
  // Storage
  SLOAD: "Storage",
  SSTORE: "Storage",
  // Memory
  MLOAD: "Memory",
  MSTORE: "Memory",
  MSTORE8: "Memory",
  MSIZE: "Memory",
  MCOPY: "Memory",
  // Calls
  CALL: "External Calls",
  STATICCALL: "External Calls",
  DELEGATECALL: "External Calls",
  CALLCODE: "External Calls",
  CREATE: "External Calls",
  CREATE2: "External Calls",
  SELFDESTRUCT: "External Calls",
  // Logs
  LOG0: "Logging",
  LOG1: "Logging",
  LOG2: "Logging",
  LOG3: "Logging",
  LOG4: "Logging",
  // Hashing
  SHA3: "Hashing",
  KECCAK256: "Hashing",
  // Stack
  POP: "Stack",
  PUSH0: "Stack",
  DUP1: "Stack",
  DUP2: "Stack",
  DUP3: "Stack",
  DUP4: "Stack",
  DUP5: "Stack",
  DUP6: "Stack",
  DUP7: "Stack",
  DUP8: "Stack",
  DUP9: "Stack",
  DUP10: "Stack",
  DUP11: "Stack",
  DUP12: "Stack",
  DUP13: "Stack",
  DUP14: "Stack",
  DUP15: "Stack",
  DUP16: "Stack",
  SWAP1: "Stack",
  SWAP2: "Stack",
  SWAP3: "Stack",
  SWAP4: "Stack",
  SWAP5: "Stack",
  SWAP6: "Stack",
  SWAP7: "Stack",
  SWAP8: "Stack",
  SWAP9: "Stack",
  SWAP10: "Stack",
  SWAP11: "Stack",
  SWAP12: "Stack",
  SWAP13: "Stack",
  SWAP14: "Stack",
  SWAP15: "Stack",
  SWAP16: "Stack",
  // Control flow
  JUMP: "Control Flow",
  JUMPI: "Control Flow",
  JUMPDEST: "Control Flow",
  STOP: "Control Flow",
  RETURN: "Control Flow",
  REVERT: "Control Flow",
  INVALID: "Control Flow",
  // Environment
  ADDRESS: "Environment",
  BALANCE: "Environment",
  ORIGIN: "Environment",
  CALLER: "Environment",
  CALLVALUE: "Environment",
  CALLDATALOAD: "Environment",
  CALLDATASIZE: "Environment",
  CALLDATACOPY: "Environment",
  CODESIZE: "Environment",
  CODECOPY: "Environment",
  GASPRICE: "Environment",
  EXTCODESIZE: "Environment",
  EXTCODECOPY: "Environment",
  RETURNDATASIZE: "Environment",
  RETURNDATACOPY: "Environment",
  EXTCODEHASH: "Environment",
  BLOCKHASH: "Environment",
  COINBASE: "Environment",
  TIMESTAMP: "Environment",
  NUMBER: "Environment",
  DIFFICULTY: "Environment",
  PREVRANDAO: "Environment",
  GASLIMIT: "Environment",
  CHAINID: "Environment",
  SELFBALANCE: "Environment",
  BASEFEE: "Environment",
  GAS: "Environment",
};

// Also map PUSH1..PUSH32 to "Stack"
for (let i = 1; i <= 32; i++) {
  OPCODE_CATEGORIES[`PUSH${i}`] = "Stack";
}

function categorizeOpcode(op: string): string {
  return OPCODE_CATEGORIES[op] ?? "Compute";
}

// ---------------------------------------------------------------------------
// Call tree gas profiling
// ---------------------------------------------------------------------------

/**
 * Try to decode a function selector from input calldata.
 */
async function decodeFunctionName(
  input: string,
  address: string,
): Promise<string> {
  if (!input || input === "0x" || input.length < 10) {
    return "(fallback)";
  }

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
    // ABI decode failed — just use the selector
  }

  return selector;
}

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
  const childEntries: GasEntry[] = [];

  if (frame.calls) {
    for (const child of frame.calls) {
      childEntries.push(await buildGasEntry(child, totalTxGas, depth + 1));
    }
  }

  const childrenGas = childEntries.reduce((sum, c) => sum + c.totalGas, 0);
  const selfGas = Math.max(0, gasUsed - childrenGas);

  const funcName = await decodeFunctionName(
    frame.input,
    frame.to,
  );

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

  function walk(entry: GasEntry) {
    flat.push({
      depth: entry.depth,
      function: entry.function,
      address: entry.address,
      callType: entry.callType,
      gasUsed: entry.totalGas,
      percentage: entry.percentage,
    });
    for (const child of entry.children) {
      walk(child);
    }
  }

  for (const entry of entries) {
    walk(entry);
  }

  // Sort by gas descending
  flat.sort((a, b) => b.gasUsed - a.gasUsed);
  return flat;
}

function aggregateByCallType(entries: GasEntry[]): Record<string, number> {
  const result: Record<string, number> = {};

  function walk(entry: GasEntry) {
    const type = entry.callType;
    result[type] = (result[type] ?? 0) + entry.gasUsed;
    for (const child of entry.children) {
      walk(child);
    }
  }

  for (const entry of entries) {
    walk(entry);
  }

  return result;
}

/**
 * Produce a gas profile from a call-tree trace.
 */
export async function profileGas(
  callTrace: CallFrame,
): Promise<GasProfile> {
  const totalGas = parseGas(callTrace.gasUsed);
  const rootEntry = await buildGasEntry(callTrace, totalGas, 0);
  const entries = [rootEntry];
  const flat = flattenEntries(entries);
  const byCallType = aggregateByCallType(entries);

  return {
    totalGas,
    entries,
    flat,
    byCallType,
  };
}

// ---------------------------------------------------------------------------
// Opcode-level gas profiling
// ---------------------------------------------------------------------------

/**
 * Produce a gas profile from an opcode-level trace.
 */
export function profileOpcodes(steps: OpcodeStep[]): OpcodeProfile {
  const categoryMap: Record<string, { gas: number; count: number }> = {};
  let totalGas = 0;

  const expensive: ExpensiveOp[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const cost = step.gasCost;
    totalGas += cost;

    const cat = categorizeOpcode(step.op);
    if (!categoryMap[cat]) {
      categoryMap[cat] = { gas: 0, count: 0 };
    }
    categoryMap[cat]!.gas += cost;
    categoryMap[cat]!.count += 1;

    expensive.push({
      step: i,
      pc: step.pc,
      op: step.op,
      gasCost: cost,
    });
  }

  // Sort expensive ops and take top 10
  expensive.sort((a, b) => b.gasCost - a.gasCost);
  const topExpensive = expensive.slice(0, 10);

  // Build category list
  const categories: OpcodeCategory[] = Object.entries(categoryMap)
    .map(([category, data]) => ({
      category,
      gas: data.gas,
      count: data.count,
      percentage: totalGas > 0 ? (data.gas / totalGas) * 100 : 0,
    }))
    .sort((a, b) => b.gas - a.gas);

  return {
    totalGas,
    categories,
    topExpensive,
  };
}
