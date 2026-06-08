/**
 * Mempool pending-transaction view.
 *
 * Reads `txpool_content` straight from the node (PulseChain Reth exposes it),
 * flattens the pending map, and sorts by effective priority tip — descending,
 * the order the node will pull them into the next block. This is the live,
 * pre-inclusion counterpart to the block view's after-the-fact ordering.
 */

import { getRpcClient } from "./chains/clients.js";
import { DEFAULT_CHAIN_ID } from "./chains/registry.js";

export interface PendingTx {
  hash: string;
  from: string;
  nonce: number;
  type: string;
  gasPrice: string | null;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
}

export interface MempoolPending {
  transactions: PendingTx[];
  pendingCount: number;
  queuedCount: number;
  /** True when pendingCount exceeded the returned slice. */
  truncated: boolean;
}

/** Cap on returned pending txs — the head of the priority-sorted queue. */
const MAX_PENDING = 100;

interface RawPoolTx {
  hash?: string;
  from?: string;
  nonce?: string;
  type?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

/** Raw RPC tx-type hex → viem-style string the web's TxGasInfo expects. */
function normalizeType(t: string | undefined): string {
  switch (t) {
    case undefined:
    case "0x0":
      return "legacy";
    case "0x1":
      return "eip2930";
    case "0x2":
      return "eip1559";
    case "0x3":
      return "eip4844";
    default:
      return t;
  }
}

function hexToNum(h: string | undefined): number {
  if (!h) return 0;
  try {
    return Number(BigInt(h));
  } catch {
    return 0;
  }
}

function hexToDecStr(h: string | undefined): string | null {
  if (h == null) return null;
  try {
    return BigInt(h).toString(10);
  } catch {
    return null;
  }
}

/** Effective priority tip used for ordering (tip, or gasPrice for legacy). */
function effectiveTip(tx: RawPoolTx): bigint {
  try {
    return BigInt(tx.maxPriorityFeePerGas ?? tx.gasPrice ?? "0x0");
  } catch {
    return 0n;
  }
}

export async function getPendingTransactions(
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<MempoolPending> {
  const client = getRpcClient(chainId);
  const content = (await client.request({
    method: "txpool_content",
  } as unknown as Parameters<typeof client.request>[0])) as {
    pending?: Record<string, Record<string, RawPoolTx>>;
    queued?: Record<string, Record<string, RawPoolTx>>;
  };

  const pending = content.pending ?? {};
  const queued = content.queued ?? {};

  const flat: RawPoolTx[] = [];
  for (const byNonce of Object.values(pending)) {
    for (const tx of Object.values(byNonce)) flat.push(tx);
  }
  const queuedCount = Object.values(queued).reduce(
    (n, byNonce) => n + Object.keys(byNonce).length,
    0,
  );
  const pendingCount = flat.length;

  // Node inclusion order ≈ effective tip, highest first.
  flat.sort((a, b) => {
    const d = effectiveTip(b) - effectiveTip(a);
    return d > 0n ? 1 : d < 0n ? -1 : 0;
  });

  const transactions: PendingTx[] = flat.slice(0, MAX_PENDING).map((tx) => ({
    hash: tx.hash ?? "",
    from: tx.from ?? "",
    nonce: hexToNum(tx.nonce),
    type: normalizeType(tx.type),
    gasPrice: hexToDecStr(tx.gasPrice),
    maxFeePerGas: hexToDecStr(tx.maxFeePerGas),
    maxPriorityFeePerGas: hexToDecStr(tx.maxPriorityFeePerGas),
  }));

  return {
    transactions,
    pendingCount,
    queuedCount,
    truncated: pendingCount > MAX_PENDING,
  };
}
