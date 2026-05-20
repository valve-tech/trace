/**
 * Raw JSON-RPC client for `debug_*` methods. Separate from viem's
 * publicClient because (a) the debug namespace isn't part of viem's typed
 * surface and (b) trace responses can be very large — we want explicit
 * 60s timeouts here, not viem's defaults.
 */

export const DEBUG_RPC_URL =
  process.env.DEBUG_RPC_URL ||
  process.env.PULSECHAIN_RPC_URL ||
  "https://rpc.pulsechain.com";

export const UNAVAILABLE_MSG =
  "The debug API is not available on the connected RPC node. " +
  "To use the debugger, configure DEBUG_RPC_URL to point to a node with the debug namespace enabled " +
  "(e.g., Erigon or Geth started with --http.api=debug).";

export interface JsonRpcResponse {
  result?: unknown;
  error?: { code: number; message: string };
}

export async function makeDebugRpc(
  method: string,
  params: unknown[],
): Promise<JsonRpcResponse> {
  const body = { jsonrpc: "2.0", id: 1, method, params };

  const res = await fetch(DEBUG_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    throw new Error(`RPC HTTP error: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as JsonRpcResponse;
}

/**
 * Detect "this node doesn't speak debug_". Different node implementations
 * return different error codes/messages for the same underlying condition;
 * we accept any of the common variants.
 */
export function isDebugUnavailable(err: {
  code: number;
  message: string;
}): boolean {
  const msg = err.message.toLowerCase();
  return (
    err.code === -32601 || // Method not found
    err.code === -32600 || // Invalid request (some nodes)
    msg.includes("method not found") ||
    msg.includes("not available") ||
    msg.includes("not supported") ||
    msg.includes("does not exist") ||
    msg.includes("debug_") ||
    msg.includes("method debug")
  );
}
