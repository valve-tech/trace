/**
 * Wire types for the gas profiler. Both call-tree and opcode-level
 * results are JSON-serialized to the debugger route, so any change
 * here is client-visible.
 */

export interface GasEntry {
  /** Decoded function name, or the raw selector, or the call type. */
  function: string;
  /** Target contract address. */
  address: string;
  /** Call type: CALL, STATICCALL, DELEGATECALL, CREATE, CREATE2. */
  callType: string;
  /** Gas consumed by this specific call (excluding children). */
  gasUsed: number;
  /** Gas consumed including children. */
  totalGas: number;
  /** Percentage of total transaction gas. */
  percentage: number;
  /** Nesting depth in the call tree. */
  depth: number;
  /** Children gas entries. */
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
  /** Hierarchical gas breakdown. */
  entries: GasEntry[];
  /** Flattened for table view, sorted by gas descending. */
  flat: FlatGasEntry[];
  /** Gas grouped by call type. */
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
  /** Gas grouped by opcode category. */
  categories: OpcodeCategory[];
  /** Top N most expensive individual operations. */
  topExpensive: ExpensiveOp[];
}
