import { blockscoutFetch } from "./client.js";
import {
  mapInternalTxRow,
  type BlockscoutInternalTxRow,
  type InternalTransactionView,
} from "./internalTransactions/transforms.js";

export type InternalTransaction = InternalTransactionView;

/**
 * Internal calls (CALL / DELEGATECALL / etc.) that happened *within* the
 * given top-level transaction. Sourced from BlockScout's v1 `txlistinternal`
 * because publicClient.getTransactionTrace is gated on debug RPC, which the
 * public PulseChain endpoint doesn't enable.
 *
 * Returns an empty array on any failure mode (BlockScout 4xx, malformed
 * payload, network timeout). Callers should treat empty as "data not
 * available" rather than "no internal calls" — those collapse at the wire
 * level here.
 */
export async function getInternalTransactions(
  hash: string,
): Promise<InternalTransaction[]> {
  const data = await blockscoutFetch<{
    status: string;
    result: BlockscoutInternalTxRow[];
  }>({
    module: "account",
    action: "txlistinternal",
    txhash: hash,
  });

  if (!data || data.status !== "1" || !Array.isArray(data.result)) {
    return [];
  }

  return data.result.map(mapInternalTxRow);
}
