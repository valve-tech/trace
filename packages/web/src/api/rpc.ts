// ---------------------------------------------------------------------------
// API client for RPC management endpoints
// ---------------------------------------------------------------------------

const API_BASE = "/api/rpc";
const RPC_ENDPOINT = "/rpc";

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
export async function fetchRpcStats(): Promise<RpcStatsResponse> {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error(`Failed to fetch RPC stats: ${res.statusText}`);
  return res.json();
}

/**
 * Fetch supported RPC methods with descriptions.
 */
export async function fetchRpcMethods(): Promise<RpcMethodsResponse> {
  const res = await fetch(`${API_BASE}/methods`);
  if (!res.ok) throw new Error(`Failed to fetch RPC methods: ${res.statusText}`);
  return res.json();
}

/**
 * Send a raw JSON-RPC request through the tester endpoint (includes timing).
 */
export async function testRpcRequest(
  request: JsonRpcRequest | JsonRpcRequest[],
): Promise<RpcTestResponse> {
  const res = await fetch(`${API_BASE}/test`, {
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
): Promise<JsonRpcResponse | JsonRpcResponse[]> {
  const res = await fetch(RPC_ENDPOINT, {
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
export async function checkRpcConnection(): Promise<boolean> {
  try {
    const res = await sendRpcRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    });
    const single = res as JsonRpcResponse;
    return !single.error && single.result !== undefined;
  } catch {
    return false;
  }
}
