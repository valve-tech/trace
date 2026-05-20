import type { MethodDescription } from "./types.js";

/**
 * Custom `valve_` methods that the proxy dispatches to internal services
 * (simulator, decoder) instead of forwarding upstream. Adding a new
 * `valve_*` method means: add a handler in handlers.ts, route it from
 * dispatch.ts, and document it here.
 */
export const VALVE_METHODS: readonly MethodDescription[] = [
  {
    name: "valve_simulateTransaction",
    namespace: "valve",
    description:
      "Simulate a transaction and return decoded results, gas estimate, and revert reason if applicable.",
    params:
      "[txParams: { from?, to?, value?, data?, gas?, gasPrice?, blockNumber?, stateOverrides?, abi? }]",
    example: {
      request: {
        jsonrpc: "2.0",
        id: 1,
        method: "valve_simulateTransaction",
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
    name: "valve_simulateBundle",
    namespace: "valve",
    description:
      "Simulate a bundle of transactions sequentially with cumulative state overrides.",
    params: "[bundleParams: { transactions: txParams[], blockNumber? }]",
    example: {
      request: {
        jsonrpc: "2.0",
        id: 1,
        method: "valve_simulateBundle",
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
    name: "valve_decodeTransaction",
    namespace: "valve",
    description:
      "Fetch a transaction by hash and decode its input data using the auto-fetched ABI from BlockScout.",
    params: "[txHash: string]",
    example: {
      request: {
        jsonrpc: "2.0",
        id: 1,
        method: "valve_decodeTransaction",
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
    name: "valve_getAssetChanges",
    namespace: "valve",
    description:
      "Simulate a transaction and return the token / native balance changes that would occur.",
    params: "[txParams: { from, to, value?, data?, gas? }]",
    example: {
      request: {
        jsonrpc: "2.0",
        id: 1,
        method: "valve_getAssetChanges",
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
