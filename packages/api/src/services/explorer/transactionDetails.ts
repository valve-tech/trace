import { type Hex, formatEther } from "viem";
import { publicClient } from "../rpc.js";
import { fetchAbi, decodeInput, decodeLogs } from "../decoder.js";
import { serialize } from "./client.js";

export interface TransactionDetails {
  hash: string;
  blockNumber: string;
  blockHash: string;
  transactionIndex: number;
  from: string;
  to: string | null;
  value: string;
  valuePLS: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  effectiveGasPrice: string;
  nonce: number;
  input: string;
  status: "success" | "reverted";
  timestamp: number | null;
  decodedInput: {
    functionName: string;
    args: { name: string; type: string; value: unknown }[];
  } | null;
  decodedLogs: {
    eventName: string;
    args: { name: string; type: string; value: unknown }[];
    address: string;
    logIndex: number;
  }[];
  rawLogs: {
    address: string;
    topics: string[];
    data: string;
    logIndex: number;
  }[];
  contractAddress: string | null;
  cumulativeGasUsed: string;
  type: string;
}

/**
 * Fetch and decode a single transaction. Combines viem's getTransaction +
 * getTransactionReceipt with ABI-aware decoding of input data and event
 * logs. `skipDecode: true` returns wire data only — useful for hot paths
 * where the caller will decode separately or doesn't need it.
 *
 * Log decoding runs twice: first against the called contract's ABI, then
 * (in full-decode mode) against every distinct emitter in the receipt
 * that hasn't been resolved yet. This handles transactions that touch
 * multiple contracts emitting events from libraries the caller doesn't
 * know about.
 */
export async function getTransactionDetails(
  hash: string,
  options: { skipDecode?: boolean } = {},
): Promise<TransactionDetails> {
  const [tx, receipt] = await Promise.all([
    publicClient.getTransaction({ hash: hash as Hex }),
    publicClient.getTransactionReceipt({ hash: hash as Hex }),
  ]);

  if (!tx) throw new Error("Transaction not found");

  let timestamp: number | null = null;
  try {
    const block = await publicClient.getBlock({
      blockNumber: tx.blockNumber!,
    });
    timestamp = Number(block.timestamp);
  } catch {
    // block lookup is best-effort
  }

  let decodedInput: TransactionDetails["decodedInput"] = null;
  let decodedLogEntries: TransactionDetails["decodedLogs"] = [];

  if (tx.to && !options.skipDecode) {
    const abi = await fetchAbi(tx.to);
    if (abi && tx.input && tx.input !== "0x") {
      const decoded = decodeInput(tx.input as Hex, abi);
      if (decoded) {
        decodedInput = {
          functionName: decoded.functionName,
          args: decoded.args,
        };
      }
    }

    if (abi && receipt.logs.length > 0) {
      const decoded = decodeLogs(receipt.logs as any, abi);
      decodedLogEntries = decoded.map((d, i) => ({
        eventName: d.eventName,
        args: d.args,
        address: receipt.logs[i]?.address ?? "",
        logIndex: Number(receipt.logs[i]?.logIndex ?? i),
      }));
    }
  }

  // Second pass: decode logs emitted by contracts other than tx.to.
  // Common for routers that delegate into multiple sub-contracts.
  if (!options.skipDecode && decodedLogEntries.length < receipt.logs.length) {
    const uniqueAddresses = [
      ...new Set(
        receipt.logs
          .map((l) => l.address.toLowerCase())
          .filter((a) => a !== tx.to?.toLowerCase()),
      ),
    ];

    for (const addr of uniqueAddresses) {
      const abi = await fetchAbi(addr);
      if (!abi) continue;

      const logsForAddr = receipt.logs.filter(
        (l) => l.address.toLowerCase() === addr,
      );
      const decoded = decodeLogs(logsForAddr as any, abi);
      for (let i = 0; i < decoded.length; i++) {
        const decodedEntry = decoded[i];
        const originalLog = logsForAddr[i];
        if (!decodedEntry) continue;
        const logIndex = Number(originalLog?.logIndex ?? 0);
        if (!decodedLogEntries.find((e) => e.logIndex === logIndex)) {
          decodedLogEntries.push({
            eventName: decodedEntry.eventName,
            args: decodedEntry.args,
            address: originalLog?.address ?? addr,
            logIndex,
          });
        }
      }
    }
  }

  const rawLogs = receipt.logs.map((l) => ({
    address: l.address,
    topics: l.topics as string[],
    data: l.data,
    logIndex: Number(l.logIndex),
  }));

  return serialize({
    hash: tx.hash,
    blockNumber: tx.blockNumber?.toString() ?? "pending",
    blockHash: tx.blockHash ?? "",
    transactionIndex: Number(tx.transactionIndex),
    from: tx.from,
    to: tx.to,
    value: tx.value.toString(),
    valuePLS: formatEther(tx.value),
    gas: tx.gas.toString(),
    gasPrice: tx.gasPrice?.toString() ?? "0",
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPrice: receipt.effectiveGasPrice?.toString() ?? "0",
    nonce: Number(tx.nonce),
    input: tx.input,
    status: receipt.status === "success" ? "success" : "reverted",
    timestamp,
    decodedInput,
    decodedLogs: decodedLogEntries,
    rawLogs,
    contractAddress: receipt.contractAddress ?? null,
    cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
    type: tx.type ?? "legacy",
  }) as TransactionDetails;
}
