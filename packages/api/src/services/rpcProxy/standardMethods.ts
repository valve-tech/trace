import type { MethodDescription } from "./types.js";

/**
 * Standard `eth_` / `net_` / `web3_` methods that the proxy forwards
 * verbatim upstream. The descriptions here are documentation only — the
 * actual routing logic lives in `dispatch.ts` and uses
 * `PASSTHROUGH_PREFIXES`. Keep this list in sync as we add new examples,
 * but don't gate routing on it.
 */
export const STANDARD_METHODS: readonly MethodDescription[] = [
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
      request: {
        jsonrpc: "2.0",
        id: 1,
        method: "web3_clientVersion",
        params: [],
      },
      response: {
        jsonrpc: "2.0",
        id: 1,
        result: "Geth/v1.x.x/linux-amd64/go1.x",
      },
    },
  },
];
