import type { Hex, Address } from "viem";
import type { JsonRpcResponse } from "./types.js";
import { simulateTransaction, simulateBundle } from "../simulator.js";
import { fetchAbi, decodeInput } from "../decoder.js";
import { publicClient } from "../rpc.js";
import { makeError, makeResponse, serializeBigInts } from "./transport.js";

type RpcId = number | string | null;

export async function handleSimulateTransaction(
  id: RpcId,
  params: unknown[],
): Promise<JsonRpcResponse> {
  const txParams = params[0];
  if (!txParams || typeof txParams !== "object") {
    return makeError(
      id,
      -32602,
      "Invalid params: expected transaction object as first parameter",
    );
  }

  try {
    // The simulator's input type is the route's Zod-validated shape; the RPC
    // boundary accepts any object and lets the simulator throw on unknown
    // fields. A precise type here would duplicate the schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await simulateTransaction(txParams as any);
    return makeResponse(id, serializeBigInts(result));
  } catch (err) {
    return makeError(
      id,
      -32000,
      err instanceof Error ? err.message : "Simulation failed",
    );
  }
}

export async function handleSimulateBundle(
  id: RpcId,
  params: unknown[],
): Promise<JsonRpcResponse> {
  const bundleParams = params[0];
  if (!bundleParams || typeof bundleParams !== "object") {
    return makeError(
      id,
      -32602,
      "Invalid params: expected bundle object as first parameter",
    );
  }

  const { transactions, blockNumber } = bundleParams as {
    transactions?: unknown[];
    blockNumber?: string | number;
  };

  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
    return makeError(id, -32602, "Invalid params: transactions array is required");
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await simulateBundle(transactions as any[], blockNumber);
    return makeResponse(id, serializeBigInts(results));
  } catch (err) {
    return makeError(
      id,
      -32000,
      err instanceof Error ? err.message : "Bundle simulation failed",
    );
  }
}

export async function handleDecodeTransaction(
  id: RpcId,
  params: unknown[],
): Promise<JsonRpcResponse> {
  const txHash = params[0];
  if (!txHash || typeof txHash !== "string") {
    return makeError(
      id,
      -32602,
      "Invalid params: expected transaction hash as first parameter",
    );
  }

  try {
    const tx = await publicClient.getTransaction({ hash: txHash as Hex });
    if (!tx) return makeError(id, -32000, "Transaction not found");

    let decodedInput = null;
    if (tx.to && tx.input && tx.input !== "0x") {
      const abi = await fetchAbi(tx.to);
      if (abi) {
        decodedInput = decodeInput(tx.input as Hex, abi);
      }
    }

    return makeResponse(id, {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      input: tx.input,
      blockNumber: tx.blockNumber?.toString() ?? null,
      decodedInput: serializeBigInts(decodedInput),
    });
  } catch (err) {
    return makeError(
      id,
      -32000,
      err instanceof Error ? err.message : "Failed to decode transaction",
    );
  }
}

export async function handleGetAssetChanges(
  id: RpcId,
  params: unknown[],
): Promise<JsonRpcResponse> {
  const txParams = params[0];
  if (!txParams || typeof txParams !== "object") {
    return makeError(
      id,
      -32602,
      "Invalid params: expected transaction object as first parameter",
    );
  }

  const { from, to, value } = txParams as {
    from?: string;
    to?: string;
    value?: string;
    data?: string;
    gas?: string;
  };

  try {
    const balancePromises: Promise<{ address: string; balance: bigint } | null>[] = [];

    if (from) {
      balancePromises.push(
        publicClient
          .getBalance({ address: from as Address })
          .then((balance) => ({ address: from, balance }))
          .catch(() => null),
      );
    }
    if (to) {
      balancePromises.push(
        publicClient
          .getBalance({ address: to as Address })
          .then((balance) => ({ address: to, balance }))
          .catch(() => null),
      );
    }

    const [balancesBefore, simResult] = await Promise.all([
      Promise.all(balancePromises),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      simulateTransaction(txParams as any),
    ]);

    const nativeChanges: Record<string, { before: string }> = {};
    for (const b of balancesBefore) {
      if (b) {
        nativeChanges[b.address] = { before: b.balance.toString() };
      }
    }

    const valueWei = value ? BigInt(value) : 0n;
    const gasUsed = simResult.gasEstimate ?? 0n;

    return makeResponse(id, {
      success: simResult.success,
      nativeBalances: nativeChanges,
      valueTransferred: valueWei.toString(),
      gasEstimate: gasUsed.toString(),
      simulation: serializeBigInts({
        success: simResult.success,
        returnData: simResult.returnData,
        gasEstimate: simResult.gasEstimate,
        revertReason: simResult.revertReason,
        decodedInput: simResult.decodedInput,
        error: simResult.error,
      }),
    });
  } catch (err) {
    return makeError(
      id,
      -32000,
      err instanceof Error ? err.message : "Failed to get asset changes",
    );
  }
}
