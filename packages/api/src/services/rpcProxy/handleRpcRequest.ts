import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";
import { rpcAnalytics } from "../rpcAnalytics.js";
import { makeError } from "./transport.js";
import { dispatchSingle } from "./dispatch.js";

/**
 * Top-level entry for the /rpc route. Handles both single and batch
 * requests per JSON-RPC 2.0; every dispatched method is recorded in
 * `rpcAnalytics` so the dashboard surface can show call counts and
 * latency percentiles.
 *
 * Batch requests are dispatched concurrently — JSON-RPC has no ordering
 * guarantee for batches, and serializing them would be wasteful for the
 * common case of "look up N balances at once."
 */
export async function handleRpcRequest(
  body: JsonRpcRequest | JsonRpcRequest[],
): Promise<JsonRpcResponse | JsonRpcResponse[]> {
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return makeError(null, -32600, "Invalid request: empty batch");
    }

    return Promise.all(body.map(dispatchWithAnalytics));
  }

  return dispatchWithAnalytics(body);
}

async function dispatchWithAnalytics(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const start = performance.now();
  try {
    const result = await dispatchSingle(req);
    const latency = performance.now() - start;
    rpcAnalytics.record(req.method ?? "unknown", latency, !result.error);
    return result;
  } catch (err) {
    const latency = performance.now() - start;
    rpcAnalytics.record(req.method ?? "unknown", latency, false);
    return makeError(
      req.id ?? null,
      -32603,
      err instanceof Error ? err.message : "Internal error",
    );
  }
}
