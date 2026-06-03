/**
 * Per-chain curated token metadata for the portfolio tracker.
 *
 * The substreams holdings indexer tracks this same curated set (see
 * `substreams/src/lib.rs`) and stores only `(token, holder) → balance`; the
 * symbol/name/decimals live here so the API can label holdings without a
 * metadata lookup. Keep the two lists in sync when extending.
 *
 * Addresses are lowercase 0x-prefixed; all metadata verified on-chain
 * (decimals()/symbol()) on 2026-06-02 — note HEX is 8 decimals.
 *
 * Only chain 369 (PulseChain mainnet) has a curated set today. 943 (testnet)
 * is the substreams pipeline prototype and has no curated tokens yet, so
 * holdings there are native-only until testnet addresses are added.
 */

export interface CuratedToken {
  /** Lowercase 0x-prefixed address. */
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
}

const CURATED_BY_CHAIN: Record<number, CuratedToken[]> = {
  369: [
    { address: "0xa1077a294dde1b09bb078844df40758a5d0f9a27", symbol: "WPLS", name: "Wrapped Pulse", decimals: 18 },
    { address: "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39", symbol: "HEX", name: "HEX", decimals: 8 },
    { address: "0x95b303987a60c71504d99aa1b13b4da07b0790ab", symbol: "PLSX", name: "PulseX", decimals: 18 },
    { address: "0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d", symbol: "INC", name: "Incentive", decimals: 18 },
  ],
};

/** Curated tokens for a chain (empty if none defined). */
export function curatedTokens(chainId: number): CuratedToken[] {
  return CURATED_BY_CHAIN[chainId] ?? [];
}

/**
 * Look up curated metadata by chain + token address (accepts 0x-prefixed or
 * bare lowercase hex). Undefined if the token isn't in the curated set.
 */
export function curatedToken(chainId: number, token: string): CuratedToken | undefined {
  const bare = token.toLowerCase().replace(/^0x/, "");
  return curatedTokens(chainId).find((t) => t.address.slice(2) === bare);
}
