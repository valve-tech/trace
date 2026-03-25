const API_BASE = "/api/testnets";

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
}

export interface CreateForkRequest {
  blockNumber?: number;
  label?: string;
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

/** Create a new fork (virtual testnet). */
export async function createFork(
  req: CreateForkRequest,
): Promise<ForkInfo> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
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
