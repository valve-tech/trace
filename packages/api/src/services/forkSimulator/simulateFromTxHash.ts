import type { Hex } from "viem";
import { publicClient } from "../rpc.js";
import type { ForkSimulationResult } from "./types.js";
import { forkSimulate } from "./forkSimulate.js";

/**
 * Replay a mined transaction on a fresh fork pinned to the block *before*
 * it landed. Useful for asking "what if this had reverted differently?"
 * or "what state would this tx have produced under different gas
 * conditions?" — the fork is the same state the tx originally executed
 * against.
 */
export async function simulateFromTxHash(
  txHash: string,
): Promise<ForkSimulationResult> {
  const tx = await publicClient.getTransaction({ hash: txHash as Hex });
  if (!tx) {
    throw new Error(`Transaction ${txHash} not found`);
  }

  const blockNumber = tx.blockNumber
    ? Number(tx.blockNumber) - 1
    : undefined;

  return forkSimulate({
    from: tx.from,
    to: tx.to ?? "0x0000000000000000000000000000000000000000",
    value: tx.value ? "0x" + tx.value.toString(16) : undefined,
    data: tx.input,
    blockNumber,
    gasLimit: Number(tx.gas),
  });
}
