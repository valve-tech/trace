/**
 * UI-side chain registry for Explore. Mirrors the launch set documented
 * in docs/superpowers/specs/2026-05-29-multichain-etherscan-labels-design.md:
 * chains 1 (Ethereum), 369 (PulseChain), 943 (PulseChain Testnet).
 *
 * Today this drives presentational pieces (the chain picker, badges,
 * stats labels). When the backend dispatcher lands `?chainid=N` routing,
 * `chainSlug` flows into the API client and individual route paths.
 *
 * Chain logos come from gib.show — a CAIP-2 keyed chain-data service
 * (https://gib.show/eip155:<id>). One source of truth so a new chain
 * needs only an entry here plus a backend handler.
 */

export interface ChainInfo {
  /** EIP-155 numeric chain id. The canonical key everywhere. */
  id: number;
  /** Short label shown in pills / picker rows. */
  name: string;
  /** URL-safe slug for route prefixes (when chainid routing lands). */
  slug: string;
  /** Native asset ticker shown alongside values. */
  symbol: string;
  /** True when the chain is a testnet — UI dims testnets in pickers. */
  testnet: boolean;
}

export const CHAINS: ChainInfo[] = [
  { id: 1, name: "Ethereum", slug: "ethereum", symbol: "ETH", testnet: false },
  { id: 369, name: "PulseChain", slug: "pulsechain", symbol: "PLS", testnet: false },
  {
    id: 943,
    name: "PulseChain Testnet",
    slug: "pulsechain-testnet",
    symbol: "tPLS",
    testnet: true,
  },
];

/** Lookup by numeric chain id, or undefined if not registered. */
export function chainById(id: number): ChainInfo | undefined {
  return CHAINS.find((c) => c.id === id);
}

/**
 * Logo URL for a chain via gib.show. The service serves CAIP-2 keyed
 * chain logos (`eip155:<chainId>`); we wrap that here so call sites
 * don't need to know the URL scheme.
 */
export function chainLogoUrl(chainId: number): string {
  return `https://gib.show/eip155:${chainId}`;
}

/**
 * The sentinel value that means "search across every registered chain"
 * in the chain picker. Distinct from any real numeric chain id.
 */
export const ALL_CHAINS = -1;
export type ChainSelection = number | typeof ALL_CHAINS;
