import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";
import { forwardUpstream, makeError } from "./transport.js";
import {
  handleDecodeTransaction,
  handleGetAssetChanges,
  handleSimulateBundle,
  handleSimulateTransaction,
} from "./handlers.js";

/**
 * Method-prefix gate for upstream passthrough. Any method whose name
 * starts with one of these prefixes is forwarded verbatim to the upstream
 * RPC. Anything else either matches a custom valve_* dispatch in the
 * switch below, or falls through to a "method not found" response.
 */
const PASSTHROUGH_PREFIXES = ["eth_", "net_", "web3_"];

/**
 * Route a single JSON-RPC request to the right handler. Custom valve_
 * methods get hand-rolled handlers; standard methods get forwarded;
 * everything else is a -32601 "method not found".
 */
export async function dispatchSingle(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const id = req.id ?? null;

  if (!req.method || typeof req.method !== "string") {
    return makeError(id, -32600, "Invalid request: missing method");
  }

  const params = req.params ?? [];

  switch (req.method) {
    case "valve_simulateTransaction":
      return handleSimulateTransaction(id, params);
    case "valve_simulateBundle":
      return handleSimulateBundle(id, params);
    case "valve_decodeTransaction":
      return handleDecodeTransaction(id, params);
    case "valve_getAssetChanges":
      return handleGetAssetChanges(id, params);
  }

  if (PASSTHROUGH_PREFIXES.some((prefix) => req.method.startsWith(prefix))) {
    return forwardUpstream(req);
  }

  return makeError(id, -32601, `Method not found: ${req.method}`);
}
