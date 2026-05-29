/**
 * Raw JSON-RPC client for `debug_*` methods. Separate from viem's
 * publicClient because (a) the debug namespace isn't part of viem's typed
 * surface and (b) trace responses can be very large — we want explicit
 * 60s timeouts here, not viem's defaults.
 */

/**
 * Resolve the debug RPC URL from env, at call time.
 *
 * Re-reads `process.env` on every call rather than capturing at module
 * load: makes the URL hot-swappable (rare in production but useful in
 * tests) and keeps the public surface a function so callers can mock
 * it cleanly.
 */
export const debugRpcUrl = (): string =>
  process.env.DEBUG_RPC_URL ||
  process.env.PULSECHAIN_RPC_URL ||
  "https://rpc.pulsechain.com";

/**
 * Resolve the optional bearer token for the debug RPC, at call time.
 * Empty string means "no Authorization header" (the common case for
 * self-hosted Geth/Erigon on a private network).
 *
 * Why this exists: private RPC endpoints fronted by a header-auth
 * gateway (e.g., the valve fleet's reth boxes — direct-{a,b}-evm-N-
 * rpc.valve.city, which gate on `Authorization: Bearer <per-chain
 * token>`) need the bearer on every request or they 401 before debug_*
 * methods are even evaluated. Without this knob, the tracer's fetch()
 * falls into the isDebugUnavailable path on every call and the trace
 * eventually surfaces as a BlockScout-fallback 5xx.
 */
export const debugRpcBearer = (): string => process.env.DEBUG_RPC_BEARER || "";

/**
 * Back-compat aliases for older consumers that captured these at
 * module load. Prefer the functions in new code — the consts
 * snapshot the env at first import, which is a sharp edge during
 * tests or env-reload scenarios.
 */
export const DEBUG_RPC_URL = debugRpcUrl();
export const DEBUG_RPC_BEARER = debugRpcBearer();

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

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const bearer = debugRpcBearer();
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }

  const res = await fetch(debugRpcUrl(), {
    method: "POST",
    headers,
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
