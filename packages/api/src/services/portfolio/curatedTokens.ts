/**
 * Per-chain curated token metadata — an optional *label override*, not the
 * token list. Holdings now cover all tokens: the substreams pipeline indexes
 * every Transfer, the API discovers a wallet's tokens from that archive, and
 * symbol/name/decimals come from on-chain reads (`balanceOf`/`decimals`/
 * `symbol`/`name`). This registry only overrides those reads for a handful of
 * major tokens — clean canonical labels and a decimals guard for contracts
 * that misreport. Absence here is normal; the on-chain values are used.
 *
 * Addresses are lowercase 0x-prefixed; metadata verified on-chain
 * (decimals()/symbol()) on 2026-06-02 — note HEX is 8 decimals.
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
