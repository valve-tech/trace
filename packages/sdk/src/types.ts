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
 * Raw event log as emitted inside a callTracer frame when the tracer is run
 * with `withLog: true`. Same shape as a JSON-RPC eth_getLogs entry, minus
 * block/transaction metadata (those are implied by the enclosing trace).
 */
export interface RawLog {
  address: string;
  topics: string[];
  data: string;
}

/**
 * Raw callTracer frame as returned by geth/erigon/anvil debug_traceTransaction
 * with `tracer: "callTracer"`. Fields are hex strings; nested calls live under
 * `calls`. Some clients omit `value` for non-payable calls. `logs` is only
 * populated when the tracer is invoked with `withLog: true`.
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
  logs?: RawLog[];
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

/**
 * Canonical event log. Same shape as `RawLog` but with branded `Address`/`Hex`
 * types and lowercased address for consistent identity comparisons.
 */
export interface Log {
  address: Address;
  topics: Hex[];
  data: Hex;
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
  logs?: Log[];

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

// ---------------------------------------------------------------------------
// Parser output types
// ---------------------------------------------------------------------------

/**
 * A decoded ERC-20 Transfer event. `from`/`to` are zero-padded out of the
 * topic words; `value` is the uint256 from the data field. `logIndex` is the
 * position among non-reverted logs in the trace (pre-order across the call
 * tree), useful for stable references back to the raw log stream.
 */
export interface TokenDelta {
  token: Address;
  from: Address;
  to: Address;
  value: bigint;
  logIndex: number;
}

/**
 * Per-address account state as it appears inside the prestateTracer diff-mode
 * envelope. All fields are optional — only changed fields appear, and an
 * account may be entirely absent from `post` if it self-destructed.
 */
export interface RawPrestateAccount {
  balance?: string;
  nonce?: number;
  code?: string;
  storage?: Record<string, string>;
}

/**
 * Wire-format envelope from `debug_traceTransaction` with
 * `tracer: "prestateTracer"` and `tracerConfig: { diffMode: true }`.
 */
export interface RawPrestateDiff {
  pre: Record<string, RawPrestateAccount>;
  post: Record<string, RawPrestateAccount>;
}

/**
 * Net balance change for one address across a transaction. `delta` is signed
 * (post − pre); positive means the address received ETH, negative means it
 * sent. Zero-delta addresses are filtered out by `parsePrestateDiff`.
 */
export interface BalanceDelta {
  address: Address;
  delta: bigint;
  preBalance: bigint;
  postBalance: bigint;
}

// ---------------------------------------------------------------------------
// Risk analyzer types
// ---------------------------------------------------------------------------

/**
 * Risk severity tier. Three-level scheme aligned with common security UX
 * conventions (Dependabot, OWASP, Sentry) — lets the UI map to semantic
 * colors without inventing a custom scale.
 */
export type RiskSeverity = "info" | "warning" | "danger";

/**
 * Discriminator string for the rule that produced a flag. Open-ended so
 * downstream consumers can extend with their own rules and still satisfy
 * the type; the SDK's built-in rules add their own literal members here as
 * they ship.
 */
export type RiskFlagType = "DELEGATECALL_UNRECOGNIZED";

/**
 * One finding emitted by `analyzeRisks`. `depth` and `childIndex` give a
 * stable handle back to the offending call frame; `address` is the target
 * (callee) of that frame, or null for contract-creation frames.
 *
 * `reverted` is `true` when the finding's frame or any ancestor reverted —
 * i.e. the code path was exercised but its on-chain effect was rolled back.
 * The analyzer surfaces these findings rather than discarding them, since
 * "what was almost executed" is informative for audits.
 */
export interface RiskFlag {
  type: RiskFlagType;
  severity: RiskSeverity;
  message: string;
  address: Address | null;
  depth: number;
  childIndex: number;
  reverted: boolean;
}

/**
 * Optional inputs to `analyzeRisks`. The whitelist suppresses rules that
 * would otherwise flag a known-trusted target — addresses must be lowercase
 * to match the normalized call-frame address shape.
 */
export interface AnalyzeRisksOptions {
  whitelist?: Set<Address>;
}
