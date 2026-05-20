import { formatEther } from "viem";
import { blockscoutFetch } from "./client.js";

export interface InternalTransaction {
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
    result: Array<{
      from: string;
      to: string;
      value: string;
      type: string;
      gas: string;
      gasUsed: string;
      input: string;
      errCode: string;
      isError: string;
    }>;
  }>({
    module: "account",
    action: "txlistinternal",
    txhash: hash,
  });

  if (!data || data.status !== "1" || !Array.isArray(data.result)) {
    return [];
  }

  return data.result.map((itx) => ({
    from: itx.from,
    to: itx.to,
    value: itx.value,
    valuePLS: formatEther(BigInt(itx.value || "0")),
    type: itx.type || "CALL",
    gas: itx.gas,
    gasUsed: itx.gasUsed,
    input: itx.input,
    errCode: itx.errCode || "",
    isError: itx.isError || "0",
  }));
}
