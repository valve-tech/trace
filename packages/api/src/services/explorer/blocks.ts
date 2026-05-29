import { type Hex, formatEther } from "viem";
import { publicClient } from "../rpc.js";
import { serialize } from "./client.js";

export interface BlockDetails {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: number;
  miner: string;
  gasUsed: string;
  gasLimit: string;
  baseFeePerGas: string | null;
  transactionCount: number;
  size: string;
  transactions: Array<{
    hash: string;
    from: string;
    to: string | null;
    value: string;
    valuePLS: string;
    gasUsed: string | null;
    type: string;
    /** Legacy/2930 gas price; null for 1559+. Wei decimal string. */
    gasPrice: string | null;
    /** 1559+ fee cap (max base + tip). Wei decimal string; null for legacy. */
    maxFeePerGas: string | null;
    /** 1559+ tip — what the node actually sorts on. Wei; null for legacy. */
    maxPriorityFeePerGas: string | null;
    methodId: string;
  }>;
}

/**
 * Fetch block details plus a compact summary of every transaction in the
 * block. Accepts either a 0x-prefixed 32-byte hash or a decimal block
 * number; viem decides which RPC method to call.
 *
 * Per-tx fields here are intentionally shallow — full decode lives in
 * `getTransactionDetails`. The block view just needs enough to render a
 * list with method-selector hints.
 */
export async function getBlockDetails(
  numberOrHash: string,
): Promise<BlockDetails> {
  // viem's getBlock return type changes by `includeTransactions` literal;
  // the upstream branch makes a precise type awkward without union narrowing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let block: any;

  if (numberOrHash.startsWith("0x") && numberOrHash.length === 66) {
    block = await publicClient.getBlock({
      blockHash: numberOrHash as Hex,
      includeTransactions: true,
    });
  } else {
    block = await publicClient.getBlock({
      blockNumber: BigInt(numberOrHash),
      includeTransactions: true,
    });
  }

  if (!block) throw new Error("Block not found");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transactions = (block.transactions || []).map((tx: any) => {
    if (typeof tx === "string") {
      return {
        hash: tx,
        from: "",
        to: null,
        value: "0",
        valuePLS: "0",
        gasUsed: null,
        type: "unknown",
        gasPrice: null,
        maxFeePerGas: null,
        maxPriorityFeePerGas: null,
        methodId: "",
      };
    }
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value?.toString() ?? "0",
      valuePLS: formatEther(tx.value ?? BigInt(0)),
      gasUsed: tx.gas?.toString() ?? null,
      type: tx.type ?? "legacy",
      gasPrice: tx.gasPrice?.toString() ?? null,
      maxFeePerGas: tx.maxFeePerGas?.toString() ?? null,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString() ?? null,
      methodId: tx.input ? tx.input.slice(0, 10) : "",
    };
  });

  return serialize({
    number: block.number?.toString() ?? "0",
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: Number(block.timestamp),
    miner: block.miner,
    gasUsed: block.gasUsed?.toString() ?? "0",
    gasLimit: block.gasLimit?.toString() ?? "0",
    baseFeePerGas: block.baseFeePerGas?.toString() ?? null,
    transactionCount: transactions.length,
    size: block.size?.toString() ?? "0",
    transactions,
  }) as BlockDetails;
}
