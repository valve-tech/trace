import type { Hex } from "viem";
import type {
  RawCallFrame,
  RawStructLog,
  TraceResult,
} from "../types.js";
import { normalizeCallFrame, normalizeStructLogs } from "./normalize.js";

export interface LoadObjectInput {
  /** Raw callTracer frame (from debug_traceTransaction with `tracer: "callTracer"`). */
  callFrame: RawCallFrame;
  /** Optional struct-logger steps (from default debug_traceTransaction mode). */
  structLogs?: RawStructLog[];
  /** Optional context — txHash and blockNumber if known. */
  txHash?: Hex;
  blockNumber?: bigint;
}

/**
 * Load a trace from an in-memory object. Useful when the caller already has
 * the raw RPC payload (e.g. cached, recorded for testing, or read from
 * another tool's export).
 */
export function loadTraceFromObject(input: LoadObjectInput): TraceResult {
  return {
    trace: normalizeCallFrame(input.callFrame),
    opcodes: input.structLogs
      ? normalizeStructLogs(input.structLogs)
      : undefined,
    txHash: input.txHash,
    blockNumber: input.blockNumber,
  };
}
