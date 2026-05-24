/**
 * Mempool API client — pending txs sorted by effective priority tip
 * (the node's next-block inclusion order).
 */

const API_BASE = "/api/mempool";

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

export async function fetchPending(): Promise<MempoolPending> {
  const res = await fetch(`${API_BASE}/pending`);
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
