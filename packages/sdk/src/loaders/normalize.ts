import type { Address, Hex } from "viem";
import type {
  CallType,
  RawCallFrame,
  RawStructLog,
  OpcodeStep,
  TraceFrame,
} from "../types.js";

const VALID_CALL_TYPES: ReadonlySet<CallType> = new Set([
  "CALL",
  "STATICCALL",
  "DELEGATECALL",
  "CALLCODE",
  "CREATE",
  "CREATE2",
  "SELFDESTRUCT",
]);

// Defensive guard for normalizer recursion. Real call trees are typically
// depth < 64; a misbehaving input shouldn't take down the host process.
const MAX_NORMALIZE_DEPTH = 1024;

function toBigInt(hex: string | undefined, fallback: bigint = 0n): bigint {
  if (hex === undefined || hex === null || hex === "") return fallback;
  try {
    return BigInt(hex);
  } catch {
    return fallback;
  }
}

function toAddress(s: string | undefined): Address | null {
  if (!s || s === "0x") return null;
  return s.toLowerCase() as Address;
}

function toHex(s: string | undefined, fallback: Hex = "0x"): Hex {
  if (!s) return fallback;
  return s as Hex;
}

function toCallType(t: string): CallType {
  const upper = t.toUpperCase() as CallType;
  return VALID_CALL_TYPES.has(upper) ? upper : "CALL";
}

/**
 * Convert a raw callTracer frame (as returned by debug_traceTransaction) into
 * the canonical TraceFrame shape. Recursively normalizes nested calls.
 *
 * `to` becomes null for contract-creation frames (CREATE/CREATE2 or when the
 * raw value is missing/`0x`). Numeric fields become bigints. Bad inputs are
 * coerced rather than thrown — loaders should produce a usable tree even from
 * partially malformed data.
 */
export function normalizeCallFrame(
  raw: RawCallFrame,
  depth: number = 0,
): TraceFrame {
  if (depth > MAX_NORMALIZE_DEPTH) {
    throw new Error(
      `normalizeCallFrame: depth ${depth} exceeds MAX_NORMALIZE_DEPTH (${MAX_NORMALIZE_DEPTH})`,
    );
  }

  const callType = toCallType(raw.type);
  const isCreate = callType === "CREATE" || callType === "CREATE2";

  const children: TraceFrame[] = raw.calls
    ? raw.calls.map((c) => normalizeCallFrame(c, depth + 1))
    : [];

  return {
    type: callType,
    from: (raw.from ? raw.from.toLowerCase() : "0x") as Address,
    to: isCreate ? null : toAddress(raw.to),
    value: toBigInt(raw.value),
    gas: toBigInt(raw.gas),
    gasUsed: toBigInt(raw.gasUsed),
    input: toHex(raw.input),
    output: toHex(raw.output),
    error: raw.error,
    revertReason: raw.revertReason,
    depth,
    children,
  };
}

/**
 * Convert raw structLogger output into canonical OpcodeStep array. Numeric
 * fields stay as numbers (they always fit in JS number for valid traces);
 * hex strings stay as hex.
 */
export function normalizeStructLogs(raw: RawStructLog[]): OpcodeStep[] {
  return raw.map((step) => ({
    pc: step.pc,
    op: step.op,
    gas: step.gas,
    gasCost: step.gasCost,
    depth: step.depth,
    stack: (step.stack ?? []) as Hex[],
    memory: (step.memory ?? []) as Hex[],
    storage: (step.storage ?? {}) as Record<Hex, Hex>,
    error: step.error,
  }));
}
