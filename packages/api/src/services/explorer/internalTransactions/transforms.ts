import { formatEther } from "viem";
import type { CallFrame } from "../../tracer.js";

/**
 * Pure flattening of a debug_traceTransaction call tree into the
 * internal-transaction rows the explorer wire shape carries. The root
 * frame is the top-level transaction itself, so only its descendants
 * count as "internal".
 *
 * Defensive defaults mirror the rest of this directory's mappers: hex
 * quantities parse through BigInt with "0x0" fallbacks, a missing `type`
 * renders as "CALL", and a frame's `error` doubles as both `errCode` and
 * the `isError` flag (the 0/1 string encoding consumers already test).
 */

export interface InternalTransactionView {
  from: string;
  to: string;
  value: string;
  valuePLS: string;
  type: string;
  gas: string;
  gasUsed: string;
  input: string;
  errCode: string;
  isError: string;
}

function hexToDecimal(hex: string | undefined): string {
  if (!hex) return "0";
  try {
    return BigInt(hex).toString();
  } catch {
    return "0";
  }
}

function mapFrame(frame: CallFrame): InternalTransactionView {
  const value = hexToDecimal(frame.value);
  return {
    from: frame.from ?? "",
    to: frame.to ?? "",
    value,
    valuePLS: formatEther(BigInt(value)),
    type: frame.type || "CALL",
    gas: hexToDecimal(frame.gas),
    gasUsed: hexToDecimal(frame.gasUsed),
    input: frame.input ?? "0x",
    errCode: frame.error ?? "",
    isError: frame.error ? "1" : "0",
  };
}

/** Depth-first flatten of the root's descendants (execution order). */
export function flattenInternalCalls(
  root: CallFrame,
): InternalTransactionView[] {
  const out: InternalTransactionView[] = [];
  const walk = (frame: CallFrame): void => {
    for (const child of frame.calls ?? []) {
      out.push(mapFrame(child));
      walk(child);
    }
  };
  walk(root);
  return out;
}
