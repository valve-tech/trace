import { createPublicClient, http, defineChain } from "viem";

/**
 * PulseChain mainnet definition.
 * chainId 369, native currency PLS.
 */
export const pulsechain = defineChain({
  id: 369,
  name: "PulseChain",
  nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.PULSECHAIN_RPC_URL || "https://rpc.pulsechain.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "PulseScan",
      url: "https://scan.pulsechain.com",
    },
  },
});

/**
 * Shared viem public client for PulseChain.
 * Re-uses a single HTTP transport across the entire API process.
 */
export const publicClient = createPublicClient({
  chain: pulsechain,
  transport: http(
    process.env.PULSECHAIN_RPC_URL || "https://rpc.pulsechain.com",
    {
      batch: true,
      retryCount: 2,
      timeout: 30_000,
    },
  ),
});
