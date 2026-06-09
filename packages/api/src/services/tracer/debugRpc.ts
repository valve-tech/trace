/**
 * Raw JSON-RPC client for `debug_*` methods. Separate from viem's
 * publicClient because (a) the debug namespace isn't part of viem's typed
 * surface and (b) trace responses can be very large — we want explicit
 * 60s timeouts here, not viem's defaults.
 */

import { currentChain } from "../chains/context.js";
import { DEFAULT_CHAIN_ID } from "../chains/registry.js";

/**
 * Resolve the debug RPC URL for the active request's chain, at call time.
 *
 * Sourced from the chain registry: the chain's `debugRpcUrl` (which for 369
 * already encodes `process.env.DEBUG_RPC_URL` — the prod debug node) when set,
 * else the chain's regular valve `rpcUrl`. Outside a request the chain context
 * resolves to 369, so the default path is unchanged — minus the old
 * `rpc.pulsechain.com` fallback, which is now a valve endpoint.
 *
 * Re-resolved on every call (not captured at module load) so it follows both
 * the active chain and any env hot-swap in tests.
 */
export const debugRpcUrl = (): string => {
  const chain = currentChain();
  if (chain.chainId === DEFAULT_CHAIN_ID) {
    // Default chain (369): honor live env overrides — DEBUG_RPC_URL (the prod
    // debug-enabled node), then PULSECHAIN_RPC_URL — both read at call time so
    // they stay hot-swappable (the registry only captures env at load). Final
    // fallback is the registry's valve endpoint, never rpc.pulsechain.com.
    return (
      process.env.DEBUG_RPC_URL ||
      process.env.PULSECHAIN_RPC_URL ||
      chain.rpcUrl
    );
  }
  // Other chains route via the registry's per-chain debug/rpc endpoint.
  return chain.debugRpcUrl ?? chain.rpcUrl;
};

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
