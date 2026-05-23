/**
 * Client for the home-view ("latest") API endpoints — Bundle 1 of
 * EXPLORER_API_SPEC §2.1–2.3.
 */

const API_BASE = "/api";

// ---------------------------------------------------------------------------
// Wire types — mirrors `services/explorer/latest.ts` on the server.
// ---------------------------------------------------------------------------

export interface BlockHeader {
  number: string;
  hash: string;
  timestamp: number;
  miner: string;
  transactionCount: number;
  gasUsed: string;
  gasLimit: string;
  baseFeePerGas: string | null;
}

export interface LatestSummary {
  latestBlock: BlockHeader;
  finalizedBlock: {
    number: string;
    hash: string;
    timestamp: number;
    lagBlocks: number;
  };
  gasPrice: {
    baseFeePerGas: string;
    suggestedPriorityFee: string;
  };
  network: {
    chainId: 369;
    name: "PulseChain";
  };
}

export interface RecentBlocksResult {
  blocks: BlockHeader[];
  cursor: { before: string } | null;
}

export interface RecentTx {
  hash: string;
  blockNumber: string;
  timestamp: number;
  from: string;
  to: string | null;
  value: string;
  valuePLS: string;
  gasUsed: string | null;
  methodId: string;
  methodName: string | null;
}

export interface RecentTxsResult {
  transactions: RecentTx[];
}

// ---------------------------------------------------------------------------
// Helpers (matches the envelope used by api/explorer.ts)
// ---------------------------------------------------------------------------

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      message = parsed.error ?? text;
    } catch {
      message = text;
    }
    throw new Error(message);
  }
  const json = (await res.json()) as { ok: boolean; result: T; error?: string };
  if (!json.ok) throw new Error(json.error ?? "Unknown API error");
  return json.result;
}

export function fetchLatestSummary(): Promise<LatestSummary> {
  return apiFetch<LatestSummary>(`${API_BASE}/latest/summary`);
}

export function fetchRecentBlocks(opts: {
  limit?: number;
  before?: string;
}): Promise<RecentBlocksResult> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.before != null) params.set("before", opts.before);
  const qs = params.toString();
  return apiFetch<RecentBlocksResult>(
    `${API_BASE}/blocks${qs ? `?${qs}` : ""}`,
  );
}

export function fetchRecentTxs(limit: number = 10): Promise<RecentTxsResult> {
  return apiFetch<RecentTxsResult>(`${API_BASE}/txs/recent?limit=${limit}`);
}
