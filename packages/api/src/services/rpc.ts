import { defineChain } from "viem";
import { DEFAULT_CHAIN_ID, getChain } from "./chains/registry.js";
import { getRpcClient } from "./chains/clients.js";

/**
 * PulseChain mainnet `Chain` definition. Kept for the few consumers that need
 * a viem `Chain` object directly (e.g. gasOracle's dedicated client). The RPC
 * URL is sourced from the chain registry's 369 entry — a valve endpoint, never
 * `rpc.pulsechain.com`.
 */
export const pulsechain = defineChain({
  id: 369,
  name: "PulseChain",
  nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },
  rpcUrls: {
    default: { http: [getChain(369).rpcUrl] },
  },
  blockExplorers: {
    default: {
      name: "PulseScan",
      url: "https://scan.pulsechain.com",
    },
  },
});

/**
 * Legacy shared viem client for the default chain (369), now sourced from the
 * registry's per-chain factory (`getRpcClient`) so there is a single source of
 * truth for upstreams — all valve endpoints, no `rpc.pulsechain.com`.
 *
 * Request-driven services should prefer `chainClient()` from
 * `./chains/context.js` so they follow the request's `?chainid`. This export
 * remains the right client for background, single-chain services (monitor,
 * scheduler) and for direct unit-test calls.
 */
export const publicClient = getRpcClient(DEFAULT_CHAIN_ID);
