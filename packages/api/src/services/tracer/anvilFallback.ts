import type { Hex } from "viem";
import { publicClient } from "../rpc.js";
import { forkManager } from "../forkManager.js";

interface AnvilRpcResponse {
  result?: unknown;
  error?: { code: number; message: string };
}

async function makeAnvilRpc(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<AnvilRpcResponse> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(120_000),
  });
  return (await res.json()) as AnvilRpcResponse;
}

/**
 * Last-resort fallback when the connected node doesn't expose `debug_*`:
 * spin up an anvil fork at the tx's block and replay the call there.
 * Anvil natively supports `debug_traceCall` and `debug_traceTransaction`.
 *
 * Uses `debug_traceCall` (not `debug_traceTransaction`) so we avoid nonce
 * / gas issues that would arise from re-sending the tx through
 * eth_sendTransaction. The fork is destroyed on RPC error and scheduled
 * for cleanup 2 minutes after a successful trace — keeps the fork around
 * long enough that a follow-up structured-log trace can reuse it.
 *
 * Returns `null` on any failure path so the caller can fall through to
 * the BlockScout reconstruction.
 */
export async function traceViaAnvilFork(
  hash: string,
  tracerConfig: unknown,
): Promise<{ result: unknown; rpcUrl: string; forkId: string } | null> {
  try {
    const tx = await publicClient.getTransaction({ hash: hash as Hex });
    if (!tx || !tx.blockNumber) return null;

    const fork = await forkManager.createFork({
      blockNumber: Number(tx.blockNumber),
      label: `trace-${hash.slice(0, 10)}`,
    });

    try {
      const callParams: Record<string, string> = {
        from: tx.from,
        to: tx.to ?? "",
        data: tx.input,
        gas: "0x" + tx.gas.toString(16),
      };
      if (tx.value > 0n) {
        callParams.value = "0x" + tx.value.toString(16);
      }

      const traceResult = await makeAnvilRpc(fork.rpcUrl, "debug_traceCall", [
        callParams,
        "latest",
        tracerConfig,
      ]);

      if (traceResult.error) {
        forkManager.destroyFork(fork.id);
        return null;
      }

      // Schedule cleanup so a follow-up trace can reuse the warm fork.
      setTimeout(() => forkManager.destroyFork(fork.id), 120_000);

      return {
        result: traceResult.result,
        rpcUrl: fork.rpcUrl,
        forkId: fork.id,
      };
    } catch {
      forkManager.destroyFork(fork.id);
      return null;
    }
  } catch {
    return null;
  }
}
