import { apiUrl } from "../lib/apiBase";
import { scoped } from "./chainScope";
import { DEFAULT_CHAIN_ID } from "../lib/chains";
/**
 * Mempool API client — pending txs sorted by effective priority tip
 * (the node's next-block inclusion order).
 */

const API_BASE = apiUrl("/api/mempool");


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
  truncated: boolean;
}

export async function fetchPending(
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<MempoolPending> {
  const res = await fetch(scoped(`${API_BASE}/pending`, chainId));
  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      message = text;
    }
    throw new Error(message);
  }
  const json = (await res.json()) as {
    ok: boolean;
    result: MempoolPending;
    error?: string;
  };
  if (!json.ok) throw new Error(json.error ?? "Unknown API error");
  return json.result;
}
