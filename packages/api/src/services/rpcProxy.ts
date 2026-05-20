/**
 * Barrel re-export for the JSON-RPC proxy service. Implementation lives
 * under `services/rpcProxy/`, split by responsibility:
 *
 *   - types.ts            JsonRpcRequest / JsonRpcResponse / MethodDescription
 *   - standardMethods.ts  documentation for eth_/net_/web3_ passthroughs
 *   - valveMethods.ts     documentation for valve_* custom methods
 *   - methodCatalog.ts    getSupportedMethods (combines the two arrays)
 *   - transport.ts        upstream fetch + makeResponse/makeError/serializeBigInts
 *   - handlers.ts         valve_* method implementations
 *   - dispatch.ts         single-request method routing
 *   - handleRpcRequest.ts public entry with analytics + batch handling
 *
 * Consumers continue to import from `./services/rpcProxy.js`.
 */

export type {
  JsonRpcRequest,
  JsonRpcResponse,
  MethodDescription,
} from "./rpcProxy/types.js";
export { getSupportedMethods } from "./rpcProxy/methodCatalog.js";
export { handleRpcRequest } from "./rpcProxy/handleRpcRequest.js";
