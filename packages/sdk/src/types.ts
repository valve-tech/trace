import type { Address, Hex } from "viem";

// ---------------------------------------------------------------------------
// Wire-format types — exactly what debug_traceTransaction returns
// ---------------------------------------------------------------------------

export type RawCallType =
  | "CALL"
  | "STATICCALL"
  | "DELEGATECALL"
  | "CALLCODE"
  | "CREATE"
  | "CREATE2"
  | "SELFDESTRUCT";

/**
 * Raw callTracer frame as returned by geth/erigon/anvil debug_traceTransaction
 * with `tracer: "callTracer"`. Fields are hex strings; nested calls live under
 * `calls`. Some clients omit `value` for non-payable calls.
 */
export interface RawCallFrame {
  type: string;
  from: string;
  to?: string;
  value?: string;
  gas: string;
  gasUsed: string;
  input: string;
  output?: string;
  error?: string;
  revertReason?: string;
  calls?: RawCallFrame[];
}

/**
 * Raw struct-logger step as returned by debug_traceTransaction with the
 * default (no-tracer) or "structLogger" mode. Numeric fields are plain
 * numbers; stack/memory are hex strings.
 */
export interface RawStructLog {
  pc: number;
  op: string;
  gas: number;
  gasCost: number;
  depth: number;
  stack?: string[];
  memory?: string[];
  storage?: Record<string, string>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Canonical types — what SDK consumers actually use
// ---------------------------------------------------------------------------

export type CallType =
  | "CALL"
  | "STATICCALL"
  | "DELEGATECALL"
  | "CALLCODE"
  | "CREATE"
  | "CREATE2"
  | "SELFDESTRUCT";

export interface DecodedParam {
  name: string;
  type: string;
  value: unknown;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

/**
 * Canonical call frame. `to` is null for contract-creation frames (CREATE /
 * CREATE2). `value`, `gas`, `gasUsed` are bigints (precision-safe). `children`
 * holds nested sub-calls in execution order.
 *
 * Enriched fields (`functionName`, `decoded*`, `sourceLocation`) are populated
 * by loaders when the necessary metadata is available; consumers should treat
 * them as optional.
 */
export interface TraceFrame {
  type: CallType;
  from: Address;
  to: Address | null;
  value: bigint;
  gas: bigint;
  gasUsed: bigint;
  input: Hex;
  output: Hex;
  error?: string;
  revertReason?: string;
  depth: number;
  children: TraceFrame[];

  // Enriched (optional)
  functionName?: string;
  decodedInput?: DecodedParam[];
  decodedOutput?: DecodedParam[];
  sourceLocation?: SourceLocation;
}

export interface OpcodeStep {
  pc: number;
  op: string;
  gas: number;
  gasCost: number;
  depth: number;
  stack: Hex[];
  memory: Hex[];
  storage: Record<Hex, Hex>;
  error?: string;
}

export interface StorageChange {
  slot: Hex;
  before: Hex;
  after: Hex;
}

export interface StateDiff {
  address: Address;
  balanceBefore?: bigint;
  balanceAfter?: bigint;
  nonceBefore?: number;
  nonceAfter?: number;
  codeBefore?: Hex;
  codeAfter?: Hex;
  storage: StorageChange[];
}

export interface GasProfileEntry {
  address: Address;
  functionName: string;
  callType: CallType;
  gasUsed: bigint;
  selfGas: bigint;
  depth: number;
  percentage: number;
  children: GasProfileEntry[];
}

export interface GasProfile {
  totalGas: bigint;
  entries: GasProfileEntry[];
  byCallType: Record<CallType, bigint>;
}

/**
 * Bundle returned by loaders. The trace is always present; opcode steps and
 * state diffs are populated when the source supports them.
 */
export interface TraceResult {
  trace: TraceFrame;
  opcodes?: OpcodeStep[];
  stateDiffs?: StateDiff[];
  txHash?: Hex;
  blockNumber?: bigint;
}
