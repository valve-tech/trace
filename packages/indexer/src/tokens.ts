/**
 * Curated PulseChain (chainId 369) token set the stopgap indexer tracks.
 *
 * WHY CURATED: indexing every ERC-20's Transfer events chain-wide would
 * exhaust disk (per the data-layer design decision). This allowlist bounds
 * storage to a high-signal set; the firehose substream that replaces this
 * indexer is what generalizes to the long tail.
 *
 * All symbol/decimals values below were verified on-chain via eth_call
 * (decimals() / symbol()) on 2026-06-02 — note HEX is 8 decimals, not 18.
 * Add bridged stables (USDC/USDT/DAI) once their PulseChain addresses are
 * verified the same way.
 */

export interface CuratedToken {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
}

export const CURATED_TOKENS: CuratedToken[] = [
  {
    symbol: "WPLS",
    name: "Wrapped Pulse",
    address: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
    decimals: 18,
  },
  {
    symbol: "HEX",
    name: "HEX",
    address: "0x2b591e99afe9f32eaA6214f7B7629768c40Eeb39",
    decimals: 8,
  },
  {
    symbol: "PLSX",
    name: "PulseX",
    address: "0x95B303987A60C71504D99Aa1b13B4DA07b0790ab",
    decimals: 18,
  },
  {
    symbol: "INC",
    name: "Incentive",
    address: "0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d",
    decimals: 18,
  },
];

/**
 * Block to begin indexing from. Deliberately recent by default so the initial
 * backfill of high-volume tokens (HEX, PLSX) stays minutes, not days, and the
 * index stays small. Balances remain correct via seed-on-first-sight (see
 * src/index.ts) plus the getHoldings balanceOf fallback for holders the index
 * hasn't observed since this block. Lower INDEXER_START_BLOCK to capture more
 * historical holders directly, at storage + sync-time cost.
 *
 * (PulseChain head was ~26.69M on 2026-06-02; this default trails head by
 * ~90k blocks ≈ a few days of activity.)
 */
export const START_BLOCK = Number(process.env.INDEXER_START_BLOCK ?? 26_600_000);
