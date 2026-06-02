import { createConfig, http } from "wagmi";
import { mainnet, pulsechain, pulsechainV4 } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * Wagmi configuration for Explore.
 *
 * Chains match the multichain launch set documented in
 * docs/superpowers/specs/2026-05-29-multichain-etherscan-labels-design.md
 * and the UI chain registry in lib/chains.ts: 1 (Ethereum),
 * 369 (PulseChain), 943 (PulseChain Testnet V4).
 *
 * Connector strategy is `injected()` only for v0 — covers MetaMask, Rabby,
 * Frame, Brave Wallet, and any other EIP-1193 provider that injects into
 * `window.ethereum`. WalletConnect / Coinbase Wallet / mobile wallets can
 * be added later by appending to the `connectors` array — no other code
 * changes needed.
 *
 * Transports are HTTP-only (no WebSocket) because we use the wallet
 * exclusively for signing — never for reads. All chain reads go through
 * Explore's own backend RPC endpoints, not through the connected wallet's
 * provider. This keeps the wallet's view of "what chain we're on"
 * decoupled from Explore's chain selector UI.
 */
export const wagmiConfig = createConfig({
  chains: [mainnet, pulsechain, pulsechainV4],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [pulsechain.id]: http(),
    [pulsechainV4.id]: http(),
  },
  // SSR is off — Vite SPA renders entirely client-side. wagmi v2 still
  // requires the field; `false` is the no-op default.
  ssr: false,
});

/**
 * Re-export the wagmi config's inferred Register type so the rest of the
 * app can `declare module 'wagmi' { interface Register { config: typeof wagmiConfig } }`
 * for chain-id literal narrowing. See main.tsx where this is registered.
 */
export type WagmiConfig = typeof wagmiConfig;
