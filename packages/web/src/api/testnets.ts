import { apiUrl } from "../lib/apiBase";
import { DEFAULT_CHAIN_ID } from "../lib/chains";

const API_BASE = apiUrl("/api/testnets");

/**
 * Scope a request to a chain via the `?chainid=N` dispatcher param. The default
 * chain is omitted so existing PulseChain calls stay byte-identical; an explicit
 * non-default chain appends the param, which the backend reads when forking (the
 * fork response then carries the resolved `chainId`). Local to this module —
 * api/explorer.ts has its own copy on purpose.
 */
function scoped(url: string, chainId: number | undefined): string {
  if (chainId === undefined || chainId === DEFAULT_CHAIN_ID) return url;
  return url + (url.includes("?") ? "&" : "?") + `chainid=${chainId}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ForkInfo {
  id: string;
  port: number;
  rpcUrl: string;
  blockNumber: number | "latest";
  label: string;
  createdAt: string;
  pid: number;
  currentBlock?: number | null;
  /** EIP-155 chain id the fork was created from. Backend now sets this. */
  chainId?: number;
}

export interface CreateForkRequest {
  blockNumber?: number;
  label?: string;
  /** Chain to fork. Defaults to PulseChain when omitted. */
  chainId?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function handleResponse<T>(res: Response): Promise<T> {
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
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Create a new fork (virtual testnet). The chain to fork is taken from
 * `req.chainId` and appended as `?chainid=N`; the backend resolves the fork
 * against that chain and echoes the `chainId` back on the response.
 */
export async function createFork(
  req: CreateForkRequest,
): Promise<ForkInfo> {
  const { chainId, ...body } = req;
  const res = await fetch(scoped(API_BASE, chainId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await handleResponse<{ ok: boolean; fork: ForkInfo }>(res);
  return data.fork;
}

/** List all active forks. */
export async function listForks(): Promise<ForkInfo[]> {
  const res = await fetch(API_BASE);
  const data = await handleResponse<{ ok: boolean; forks: ForkInfo[] }>(res);
  return data.forks;
}

/** Get details for a single fork, including current block number. */
export async function getFork(id: string): Promise<ForkInfo> {
  const res = await fetch(`${API_BASE}/${id}`);
  const data = await handleResponse<{ ok: boolean; fork: ForkInfo }>(res);
  return data.fork;
}

/** Destroy a fork. */
export async function destroyFork(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
  await handleResponse<{ ok: boolean }>(res);
}

/** Take a snapshot of the fork state. */
export async function takeSnapshot(
  id: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/${id}/snapshot`, { method: "POST" });
  const data = await handleResponse<{ ok: boolean; snapshotId: string }>(res);
  return data.snapshotId;
}

/** Revert to a previously taken snapshot. */
export async function revertSnapshot(
  id: string,
  snapshotId: string,
): Promise<boolean> {
  const res = await fetch(`${API_BASE}/${id}/revert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshotId }),
  });
  const data = await handleResponse<{ ok: boolean; success: boolean }>(res);
  return data.success;
}

/** Fund an address with PLS on the fork. Amount is in PLS (not wei). */
export async function fundAddress(
  id: string,
  address: string,
  amount: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}/fund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, amount }),
  });
  await handleResponse<{ ok: boolean }>(res);
}

/** Mine a number of blocks on the fork. */
export async function mineBlocks(
  id: string,
  count: number,
): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}/mine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
  await handleResponse<{ ok: boolean }>(res);
}

/** Advance time on the fork by the given number of seconds. */
export async function timeTravel(
  id: string,
  seconds: number,
): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}/time-travel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seconds }),
  });
  await handleResponse<{ ok: boolean }>(res);
}

/** Proxy an arbitrary JSON-RPC call to the fork. */
export async function proxyRpc(
  id: string,
  method: string,
  params: unknown[] = [],
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/${id}/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
  });
  const data = await handleResponse<{ result: unknown }>(res);
  return data.result;
}
