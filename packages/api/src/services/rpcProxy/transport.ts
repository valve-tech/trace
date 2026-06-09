import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";
import { currentChain } from "../chains/context.js";

/**
 * Build a success response with the caller's id. JSON-RPC requires
 * responses to echo the request id verbatim (or `null` for notifications);
 * passing `null` here is the right shape when the request didn't include
 * one.
 */
export function makeResponse(
  id: number | string | null,
  result: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

/**
 * Build an error response. `data` is optional per the JSON-RPC 2.0 spec;
 * we only include the property when the caller passes something so the
 * wire output stays tidy.
 */
export function makeError(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined && { data }) },
  };
}

/** Recursively convert BigInt values to strings for JSON serialisation. */
export function serializeBigInts(val: unknown): unknown {
  if (typeof val === "bigint") return val.toString();
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(serializeBigInts);
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeBigInts(v);
    }
    return out;
  }
  return val;
}

/**
 * Forward a passthrough request (eth_/net_/web3_) to the upstream RPC and
 * return its response with the id rewritten to match the inbound request.
 * Upstream id rewriting matters because some clients send numeric ids and
 * some send strings — preserve what the caller sent.
 */
export async function forwardUpstream(
  body: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  // Per-chain valve endpoint resolved from the request's chain context
  // (`?chainid`), defaulting to 369 outside a request. Replaces the old single
  // hardcoded rpc.pulsechain.com upstream so /rpc honors the requested chain.
  const res = await fetch(currentChain().rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: body.id ?? null,
      method: body.method,
      params: body.params ?? [],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    return makeError(
      body.id ?? null,
      -32603,
      `Upstream RPC returned HTTP ${res.status}`,
    );
  }

  const json = (await res.json()) as JsonRpcResponse;
  return { ...json, id: body.id ?? null };
}
