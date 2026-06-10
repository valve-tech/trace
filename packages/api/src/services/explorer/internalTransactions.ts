import { traceTransaction } from "../tracer.js";
import {
  flattenInternalCalls,
  type InternalTransactionView,
} from "./internalTransactions/transforms.js";

export type InternalTransaction = InternalTransactionView;

/**
 * Internal calls (CALL / DELEGATECALL / etc.) that happened *within* the
 * given top-level transaction, flattened from the debug_traceTransaction
 * call tree (cached by the tracer; anvil-fork replay covers nodes without
 * the debug API).
 *
 * Returns an empty array when no trace source is available. Callers should
 * treat empty as "data not available" rather than "no internal calls" —
 * those collapse at the wire level here.
 */
export async function getInternalTransactions(
  hash: string,
): Promise<InternalTransaction[]> {
  try {
    const result = await traceTransaction(hash);
    if (!result.trace) return [];
    return flattenInternalCalls(result.trace);
  } catch {
    return [];
  }
}
