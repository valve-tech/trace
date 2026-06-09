import {
  type Hex,
  formatEther,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
} from "viem";
import { publicClient } from "../rpc.js";
import { fetchAbi, decodeInput, decodeLogs } from "../decoder.js";
import { serialize } from "./client.js";
import { ApiError } from "../../lib/respond.js";
import {
  mergeDecodedLogs,
  otherEmitters,
  toRawLog,
} from "./transactionDetails/transforms.js";

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
  let tx: Awaited<ReturnType<typeof publicClient.getTransaction>>;
  let receipt: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>>;
  try {
    [tx, receipt] = await Promise.all([
      publicClient.getTransaction({ hash: hash as Hex }),
      publicClient.getTransactionReceipt({ hash: hash as Hex }),
    ]);
  } catch (err) {
    // viem throws a typed not-found (for the tx or its receipt) that carries
    // the library version in its message — surface a clean 404 instead of a
    // 500 that leaks "Version: viem@x.y.z" to the client.
    if (
      err instanceof TransactionNotFoundError ||
      err instanceof TransactionReceiptNotFoundError
    ) {
      throw new ApiError(404, "Transaction not found");
    }
    throw err;
  }

  if (!tx) throw new ApiError(404, "Transaction not found");

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
      // viem's receipt log type is narrower than decodeLogs' input — both
      // share the {address, topics, data} shape, but viem layers branded
      // types we'd have to mirror to match precisely.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    for (const addr of otherEmitters(receipt.logs, tx.to ?? null)) {
      const abi = await fetchAbi(addr);
      if (!abi) continue;

      const logsForAddr = receipt.logs.filter(
        (l) => l.address.toLowerCase() === addr,
      );
      // viem's branded receipt log type → decodeLogs' looser input.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decoded = decodeLogs(logsForAddr as any, abi);
      const incoming: TransactionDetails["decodedLogs"] = [];
      for (let i = 0; i < decoded.length; i++) {
        const decodedEntry = decoded[i];
        const originalLog = logsForAddr[i];
        if (!decodedEntry) continue;
        incoming.push({
          eventName: decodedEntry.eventName,
          args: decodedEntry.args,
          address: originalLog?.address ?? addr,
          logIndex: Number(originalLog?.logIndex ?? 0),
        });
      }
      decodedLogEntries = mergeDecodedLogs(decodedLogEntries, incoming);
    }
  }

  const rawLogs = receipt.logs.map(toRawLog);

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
