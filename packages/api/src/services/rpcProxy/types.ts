/**
 * JSON-RPC wire types shared across the proxy. Mirrors the standard
 * envelope: a request has `method` + `params`; a response carries
 * either `result` or `error`, never both.
 *
 * `MethodDescription` is what `/api/rpc/methods` returns — a per-method
 * docstring + example request/response pair the UI renders in the
 * playground.
 */

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method: string;
  params?: unknown[];
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface MethodDescription {
  name: string;
  namespace: string;
  description: string;
  params: string;
  example: { request: JsonRpcRequest; response: JsonRpcResponse };
}
