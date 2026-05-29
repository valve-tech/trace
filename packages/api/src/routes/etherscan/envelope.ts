/**
 * Etherscan API response envelope.
 *
 * Etherscan's tools expect every response to look like:
 *
 *   success: { status: "1", message: "OK",    result: <payload> }
 *   "not found" / error / invalid input:
 *            { status: "0", message: "NOTOK", result: <human string> }
 *
 * `result` is stringly-typed for errors and structured for success. Tools
 * (hardhat-verify, foundry, ethers, web3.py) branch on `status === "1"` —
 * an HTTP 200 + status "0" is the normal way Etherscan signals "address has
 * no source code" rather than HTTP 404. Mirroring this is non-negotiable;
 * tools that retry on HTTP errors but accept status "0" will misbehave if
 * we use HTTP statuses instead.
 *
 * The verify flow is the one exception: a successful submission returns
 * status "1" with `result` being the GUID string, and `checkverifystatus`
 * eventually returns status "1" + result "Pass - Verified" or status "0" +
 * descriptive error.
 */

export interface EtherscanOk<T = unknown> {
  status: "1";
  message: "OK";
  result: T;
}

export interface EtherscanErr {
  status: "0";
  message: string;
  result: string;
}

export type EtherscanResponse<T = unknown> = EtherscanOk<T> | EtherscanErr;

export function etherscanOk<T>(result: T, message: "OK" = "OK"): EtherscanOk<T> {
  return { status: "1", message, result };
}

/**
 * `message` defaults to "NOTOK" — Etherscan's catch-all. Use specific
 * messages ("No transactions found", "No source found") when the tool
 * caller cares about disambiguating "empty result" from "input error".
 */
export function etherscanErr(
  result: string,
  message: string = "NOTOK",
): EtherscanErr {
  return { status: "0", message, result };
}

/**
 * JSON-RPC 2.0 envelope — used exclusively by the `proxy` module.
 *
 * Etherscan's `module=proxy` actions are a thin passthrough to standard
 * Ethereum JSON-RPC, and they preserve the JSON-RPC envelope rather than
 * wrapping it in the `{status, message, result}` shape. Tools like
 * ethers.js's EtherscanProvider expect this exact shape because they
 * decode the proxy response with their generic JSON-RPC parser.
 *
 * `id` defaults to 1 — Etherscan uses 83 as a constant but neither
 * value is meaningful to callers; they echo back whatever id arrived.
 */
export interface JsonRpcOk<T = unknown> {
  jsonrpc: "2.0";
  id: number;
  result: T;
}

export interface JsonRpcErr {
  jsonrpc: "2.0";
  id: number;
  error: { code: number; message: string };
}

export type JsonRpcResponse<T = unknown> = JsonRpcOk<T> | JsonRpcErr;

export function jsonRpcOk<T>(result: T, id: number = 1): JsonRpcOk<T> {
  return { jsonrpc: "2.0", id, result };
}

/**
 * `code` defaults to -32000 — JSON-RPC's reserved "server error" range,
 * which Etherscan's proxy uses as a catch-all for upstream node errors.
 */
export function jsonRpcErr(
  message: string,
  code: number = -32000,
  id: number = 1,
): JsonRpcErr {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
