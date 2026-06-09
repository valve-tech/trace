import { apiUrl } from "../lib/apiBase";
import { DEFAULT_CHAIN_ID } from "../lib/chains";
// ---------------------------------------------------------------------------
// API client for RPC management endpoints
// ---------------------------------------------------------------------------

const API_BASE = apiUrl("/api/rpc");
const RPC_ENDPOINT = apiUrl("/rpc");

/**
 * Scope a request to a chain via `?chainid=N`. The default chain is omitted so
 * existing PulseChain calls stay byte-identical; non-default chains append the
 * param, which the backend chain-context middleware reads. Mirrors the private
 * `scoped` helper in explorer.ts — kept local per module by design.
 */
function scoped(url: string, chainId: number): string {
  if (chainId === DEFAULT_CHAIN_ID) return url;
  return url + (url.includes("?") ? "&" : "?") + `chainid=${chainId}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string | null;
  method: string;
  params?: unknown[];
}

export interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface MethodStats {
  count: number;
  avgLatency: number;
  errorCount: number;
  lastCalled: number;
}

export interface RequestRecord {
  method: string;
  timestamp: number;
  latencyMs: number;
  success: boolean;
}

export interface RpcStatsResponse {
  ok: boolean;
  totalRequests: number;
  methodBreakdown: Record<string, MethodStats>;
  recentRequests: RequestRecord[];
}

export interface MethodDescription {
  name: string;
  namespace: string;
  description: string;
  params: string;
  example: {
    request: JsonRpcRequest;
    response: JsonRpcResponse;
  };
}

export interface RpcMethodsResponse {
  ok: boolean;
  methods: MethodDescription[];
}

export interface RpcTestResponse {
  ok: boolean;
  latencyMs: number;
  response: JsonRpcResponse | JsonRpcResponse[];
  error?: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Fetch RPC analytics stats.
 */
export async function fetchRpcStats(
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<RpcStatsResponse> {
  const res = await fetch(scoped(`${API_BASE}/stats`, chainId));
  if (!res.ok) throw new Error(`Failed to fetch RPC stats: ${res.statusText}`);
  return res.json();
}

/**
 * Fetch supported RPC methods with descriptions.
 */
export async function fetchRpcMethods(
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<RpcMethodsResponse> {
  const res = await fetch(scoped(`${API_BASE}/methods`, chainId));
  if (!res.ok) throw new Error(`Failed to fetch RPC methods: ${res.statusText}`);
  return res.json();
}

/**
 * Send a raw JSON-RPC request through the tester endpoint (includes timing).
 */
export async function testRpcRequest(
  request: JsonRpcRequest | JsonRpcRequest[],
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<RpcTestResponse> {
  const res = await fetch(scoped(`${API_BASE}/test`, chainId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`RPC test failed: ${res.statusText}`);
  return res.json();
}

/**
 * Send a raw JSON-RPC request through the main /rpc endpoint.
 */
export async function sendRpcRequest(
  request: JsonRpcRequest | JsonRpcRequest[],
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<JsonRpcResponse | JsonRpcResponse[]> {
  const res = await fetch(scoped(RPC_ENDPOINT, chainId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`RPC request failed: ${res.statusText}`);
  return res.json();
}

/**
 * Quick connectivity check — sends eth_chainId and checks for a valid response.
 */
export async function checkRpcConnection(
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<boolean> {
  try {
    const res = await sendRpcRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      },
      chainId,
    );
    const single = res as JsonRpcResponse;
    return !single.error && single.result !== undefined;
  } catch {
    return false;
  }
}
