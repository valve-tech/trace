// ---------------------------------------------------------------------------
// JSON-RPC Proxy Service
// Routes standard eth_/net_/web3_ methods upstream and custom pulsedev_
// methods to internal simulation / decoding services.
// ---------------------------------------------------------------------------

import type { Hex, Address } from "viem";
import { simulateTransaction, simulateBundle } from "./simulator.js";
import { fetchAbi, decodeInput } from "./decoder.js";
import { publicClient } from "./rpc.js";
import { rpcAnalytics } from "./rpcAnalytics.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Upstream RPC URL
// ---------------------------------------------------------------------------

const UPSTREAM_RPC =
  process.env.PULSECHAIN_RPC_URL || "https://rpc.pulsechain.com";

// ---------------------------------------------------------------------------
// Standard method namespaces that are forwarded upstream
// ---------------------------------------------------------------------------

const PASSTHROUGH_PREFIXES = ["eth_", "net_", "web3_"];

// ---------------------------------------------------------------------------
// Supported custom methods with descriptions
// ---------------------------------------------------------------------------

export interface MethodDescription {
  name: string;
  namespace: string;
  description: string;
  params: string;
  example: { request: JsonRpcRequest; response: JsonRpcResponse };
}

export function getSupportedMethods(): MethodDescription[] {
  return [
    // --- Standard passthrough methods (representative subset) ---
    {
      name: "eth_blockNumber",
      namespace: "eth",
      description: "Returns the current block number.",
      params: "None",
      example: {
        request: { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
        response: { jsonrpc: "2.0", id: 1, result: "0x1234567" },
      },
    },
    {
      name: "eth_getBalance",
      namespace: "eth",
      description: "Returns the balance of an address in wei.",
      params: "[address: string, blockTag: string]",
      example: {
        request: {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: ["0x742d35Cc6634C0532925a3b844Bc9e7595f2bD3E", "latest"],
        },
        response: { jsonrpc: "2.0", id: 1, result: "0x56bc75e2d63100000" },
      },
    },
    {
      name: "eth_getTransactionByHash",
      namespace: "eth",
      description: "Returns transaction details by hash.",
      params: "[txHash: string]",
      example: {
        request: {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getTransactionByHash",
          params: ["0xabc123..."],
        },
        response: { jsonrpc: "2.0", id: 1, result: { hash: "0xabc123..." } },
      },
    },
    {
      name: "eth_call",
      namespace: "eth",
      description: "Executes a call without creating a transaction.",
      params: "[txObject: { from?, to, data?, value?, gas? }, blockTag: string]",
      example: {
        request: {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: "0xA0b869...", data: "0x70a08231..." }, "latest"],
        },
        response: { jsonrpc: "2.0", id: 1, result: "0x000...0001" },
      },
    },
    {
      name: "eth_gasPrice",
      namespace: "eth",
      description: "Returns the current gas price in wei.",
      params: "None",
      example: {
        request: { jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] },
        response: { jsonrpc: "2.0", id: 1, result: "0x3b9aca00" },
      },
    },
    {
      name: "eth_chainId",
      namespace: "eth",
      description: "Returns the chain ID (369 for PulseChain).",
      params: "None",
      example: {
        request: { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
        response: { jsonrpc: "2.0", id: 1, result: "0x171" },
      },
    },
    {
      name: "eth_getTransactionReceipt",
      namespace: "eth",
      description: "Returns the receipt of a transaction by hash.",
      params: "[txHash: string]",
      example: {
        request: {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getTransactionReceipt",
          params: ["0xabc123..."],
        },
        response: { jsonrpc: "2.0", id: 1, result: { status: "0x1" } },
      },
    },
    {
      name: "eth_getCode",
      namespace: "eth",
      description: "Returns the bytecode at a given address.",
      params: "[address: string, blockTag: string]",
      example: {
        request: {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getCode",
          params: ["0xA0b869...", "latest"],
        },
        response: { jsonrpc: "2.0", id: 1, result: "0x6080604052..." },
      },
    },
    {
      name: "net_version",
      namespace: "net",
      description: "Returns the current network ID.",
      params: "None",
      example: {
        request: { jsonrpc: "2.0", id: 1, method: "net_version", params: [] },
        response: { jsonrpc: "2.0", id: 1, result: "369" },
      },
    },
    {
      name: "web3_clientVersion",
      namespace: "web3",
      description: "Returns the client version string.",
      params: "None",
      example: {
        request: { jsonrpc: "2.0", id: 1, method: "web3_clientVersion", params: [] },
        response: { jsonrpc: "2.0", id: 1, result: "Geth/v1.x.x/linux-amd64/go1.x" },
      },
    },

    // --- Custom PulseDev methods ---
    {
      name: "pulsedev_simulateTransaction",
      namespace: "pulsedev",
      description:
        "Simulate a transaction and return decoded results, gas estimate, and revert reason if applicable.",
      params:
        "[txParams: { from?, to?, value?, data?, gas?, gasPrice?, blockNumber?, stateOverrides?, abi? }]",
      example: {
        request: {
          jsonrpc: "2.0",
          id: 1,
          method: "pulsedev_simulateTransaction",
          params: [
            {
              from: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD3E",
              to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
              data: "0xa9059cbb...",
            },
          ],
        },
        response: {
          jsonrpc: "2.0",
          id: 1,
          result: {
            success: true,
            returnData: "0x0000...0001",
            gasEstimate: "52341",
            decodedInput: { functionName: "transfer", args: [] },
            decodedOutput: { values: [] },
          },
        },
      },
    },
    {
      name: "pulsedev_simulateBundle",
      namespace: "pulsedev",
      description:
        "Simulate a bundle of transactions sequentially with cumulative state overrides.",
      params:
        "[bundleParams: { transactions: txParams[], blockNumber? }]",
      example: {
        request: {
          jsonrpc: "2.0",
          id: 1,
          method: "pulsedev_simulateBundle",
          params: [
            {
              transactions: [
                { from: "0x742d...", to: "0xA0b8...", data: "0xa905..." },
                { from: "0x742d...", to: "0xA0b8...", data: "0x70a0..." },
              ],
            },
          ],
        },
        response: {
          jsonrpc: "2.0",
          id: 1,
          result: [
            { success: true, returnData: "0x0000...0001" },
            { success: true, returnData: "0x0000...0064" },
          ],
        },
      },
    },
    {
      name: "pulsedev_decodeTransaction",
      namespace: "pulsedev",
      description:
        "Fetch a transaction by hash and decode its input data using the auto-fetched ABI from BlockScout.",
      params: "[txHash: string]",
      example: {
        request: {
          jsonrpc: "2.0",
          id: 1,
          method: "pulsedev_decodeTransaction",
          params: ["0xabc123..."],
        },
        response: {
          jsonrpc: "2.0",
          id: 1,
          result: {
            hash: "0xabc123...",
            from: "0x742d...",
            to: "0xA0b8...",
            decodedInput: { functionName: "transfer", args: [] },
          },
        },
      },
    },
    {
      name: "pulsedev_getAssetChanges",
      namespace: "pulsedev",
      description:
        "Simulate a transaction and return the token / native balance changes that would occur.",
      params: "[txParams: { from, to, value?, data?, gas? }]",
      example: {
        request: {
          jsonrpc: "2.0",
          id: 1,
          method: "pulsedev_getAssetChanges",
          params: [
            {
              from: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD3E",
              to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
              data: "0xa9059cbb...",
            },
          ],
        },
        response: {
          jsonrpc: "2.0",
          id: 1,
          result: {
            success: true,
            nativeChange: { from: "-1000000000000000000", to: "0" },
            simulation: { success: true, gasEstimate: "21000" },
          },
        },
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(
  id: number | string | null,
  result: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function makeError(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined && { data }) } };
}

/**
 * Recursively convert BigInt values to strings for JSON serialisation.
 */
function serializeBigInts(val: unknown): unknown {
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

// ---------------------------------------------------------------------------
// Upstream passthrough
// ---------------------------------------------------------------------------

async function forwardUpstream(body: JsonRpcRequest): Promise<JsonRpcResponse> {
  const res = await fetch(UPSTREAM_RPC, {
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
    return makeError(body.id ?? null, -32603, `Upstream RPC returned HTTP ${res.status}`);
  }

  const json = (await res.json()) as JsonRpcResponse;
  // Ensure the id matches what the caller sent
  return { ...json, id: body.id ?? null };
}

// ---------------------------------------------------------------------------
// Custom method handlers
// ---------------------------------------------------------------------------

async function handleSimulateTransaction(
  id: number | string | null,
  params: unknown[],
): Promise<JsonRpcResponse> {
  const txParams = params[0];
  if (!txParams || typeof txParams !== "object") {
    return makeError(id, -32602, "Invalid params: expected transaction object as first parameter");
  }

  try {
    const result = await simulateTransaction(txParams as any);
    return makeResponse(id, serializeBigInts(result));
  } catch (err) {
    return makeError(
      id,
      -32000,
      err instanceof Error ? err.message : "Simulation failed",
    );
  }
}

async function handleSimulateBundle(
  id: number | string | null,
  params: unknown[],
): Promise<JsonRpcResponse> {
  const bundleParams = params[0];
  if (!bundleParams || typeof bundleParams !== "object") {
    return makeError(id, -32602, "Invalid params: expected bundle object as first parameter");
  }

  const { transactions, blockNumber } = bundleParams as {
    transactions?: unknown[];
    blockNumber?: string | number;
  };

  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
    return makeError(id, -32602, "Invalid params: transactions array is required");
  }

  try {
    const results = await simulateBundle(transactions as any[], blockNumber);
    return makeResponse(id, serializeBigInts(results));
  } catch (err) {
    return makeError(
      id,
      -32000,
      err instanceof Error ? err.message : "Bundle simulation failed",
    );
  }
}

async function handleDecodeTransaction(
  id: number | string | null,
  params: unknown[],
): Promise<JsonRpcResponse> {
  const txHash = params[0];
  if (!txHash || typeof txHash !== "string") {
    return makeError(id, -32602, "Invalid params: expected transaction hash as first parameter");
  }

  try {
    const tx = await publicClient.getTransaction({ hash: txHash as Hex });

    if (!tx) {
      return makeError(id, -32000, "Transaction not found");
    }

    let decodedInput = null;

    if (tx.to && tx.input && tx.input !== "0x") {
      const abi = await fetchAbi(tx.to);
      if (abi) {
        decodedInput = decodeInput(tx.input as Hex, abi);
      }
    }

    return makeResponse(id, {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      input: tx.input,
      blockNumber: tx.blockNumber?.toString() ?? null,
      decodedInput: serializeBigInts(decodedInput),
    });
  } catch (err) {
    return makeError(
      id,
      -32000,
      err instanceof Error ? err.message : "Failed to decode transaction",
    );
  }
}

async function handleGetAssetChanges(
  id: number | string | null,
  params: unknown[],
): Promise<JsonRpcResponse> {
  const txParams = params[0];
  if (!txParams || typeof txParams !== "object") {
    return makeError(id, -32602, "Invalid params: expected transaction object as first parameter");
  }

  const { from, to, value, data: _data, gas: _gas } = txParams as {
    from?: string;
    to?: string;
    value?: string;
    data?: string;
    gas?: string;
  };

  try {
    // Get native balances before (current state)
    const balancePromises: Promise<{ address: string; balance: bigint } | null>[] = [];

    if (from) {
      balancePromises.push(
        publicClient
          .getBalance({ address: from as Address })
          .then((balance) => ({ address: from, balance }))
          .catch(() => null),
      );
    }
    if (to) {
      balancePromises.push(
        publicClient
          .getBalance({ address: to as Address })
          .then((balance) => ({ address: to, balance }))
          .catch(() => null),
      );
    }

    const [balancesBefore, simResult] = await Promise.all([
      Promise.all(balancePromises),
      simulateTransaction(txParams as any),
    ]);

    // Build native balance change info
    const nativeChanges: Record<string, { before: string }> = {};
    for (const b of balancesBefore) {
      if (b) {
        nativeChanges[b.address] = { before: b.balance.toString() };
      }
    }

    // Estimate the native value transfer
    const valueWei = value ? BigInt(value) : 0n;
    const gasUsed = simResult.gasEstimate ?? 0n;

    return makeResponse(id, {
      success: simResult.success,
      nativeBalances: nativeChanges,
      valueTransferred: valueWei.toString(),
      gasEstimate: gasUsed.toString(),
      simulation: serializeBigInts({
        success: simResult.success,
        returnData: simResult.returnData,
        gasEstimate: simResult.gasEstimate,
        revertReason: simResult.revertReason,
        decodedInput: simResult.decodedInput,
        error: simResult.error,
      }),
    });
  } catch (err) {
    return makeError(
      id,
      -32000,
      err instanceof Error ? err.message : "Failed to get asset changes",
    );
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

async function dispatchSingle(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const id = req.id ?? null;

  // Validate basic structure
  if (!req.method || typeof req.method !== "string") {
    return makeError(id, -32600, "Invalid request: missing method");
  }

  const params = req.params ?? [];

  // Check for custom pulsedev_ methods first
  switch (req.method) {
    case "pulsedev_simulateTransaction":
      return handleSimulateTransaction(id, params);
    case "pulsedev_simulateBundle":
      return handleSimulateBundle(id, params);
    case "pulsedev_decodeTransaction":
      return handleDecodeTransaction(id, params);
    case "pulsedev_getAssetChanges":
      return handleGetAssetChanges(id, params);
  }

  // Check for standard passthrough namespaces
  const isPassthrough = PASSTHROUGH_PREFIXES.some((prefix) =>
    req.method.startsWith(prefix),
  );

  if (isPassthrough) {
    return forwardUpstream(req);
  }

  // Unknown method
  return makeError(id, -32601, `Method not found: ${req.method}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Handle a JSON-RPC request (single or batch).
 * Records analytics for each request processed.
 */
export async function handleRpcRequest(
  body: JsonRpcRequest | JsonRpcRequest[],
): Promise<JsonRpcResponse | JsonRpcResponse[]> {
  // Batch request
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return makeError(null, -32600, "Invalid request: empty batch");
    }

    const results = await Promise.all(
      body.map(async (req) => {
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
      }),
    );

    return results;
  }

  // Single request
  const start = performance.now();
  try {
    const result = await dispatchSingle(body);
    const latency = performance.now() - start;
    rpcAnalytics.record(body.method ?? "unknown", latency, !result.error);
    return result;
  } catch (err) {
    const latency = performance.now() - start;
    rpcAnalytics.record(body.method ?? "unknown", latency, false);
    return makeError(
      body.id ?? null,
      -32603,
      err instanceof Error ? err.message : "Internal error",
    );
  }
}
