import { formatUnits } from "viem";
import { curatedToken } from "./curatedTokens.js";

/**
 * Pure transforms for portfolio holdings — no DB, no network, so they're
 * unit-testable in isolation. The service layer (`./holdings.ts`) discovers a
 * holder's tokens from the transfers archive, reads each token's current
 * balance + metadata on-chain (multicall), then maps the reads through here.
 */

export interface Holding {
  /** Lowercased 0x-prefixed token contract address. */
  tokenAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Raw integer balance (smallest unit). */
  balance: string;
  /** Decimals-adjusted decimal string. */
  balanceFormatted: string;
}

export interface NativeHolding {
  symbol: string;
  balance: string;
  balanceFormatted: string;
}

export interface HoldingsResult {
  chainId: number;
  address: string;
  native: NativeHolding;
  holdings: Holding[];
  /** True when the transfers archive exists for this chain (discovery ran). */
  indexed: boolean;
}

/**
 * An on-chain read for one discovered token: the current `balanceOf` plus the
 * metadata needed to label and format it. `balanceOf`/`decimals` are required
 * (a token that fails those is dropped upstream); `symbol`/`name` may be empty
 * when the contract doesn't implement them or returns a non-string.
 */
export interface TokenRead {
  /** lowercase hex, no 0x (the transfers-archive key form). */
  token: string;
  /** current raw balance from balanceOf() — the ground truth. */
  balance: bigint;
  decimals: number;
  symbol: string;
  name: string;
}

/** Decimals-adjust a raw integer balance; "0" on any parse failure. */
export function formatTokenAmount(balance: string, decimals: number): string {
  try {
    return formatUnits(BigInt(balance), decimals);
  } catch {
    return "0";
  }
}

/**
 * Map an on-chain token read to a `Holding`. Returns null for non-positive
 * balances. A curated registry entry (when present) overrides the on-chain
 * symbol/name/decimals — clean labels for major tokens and a decimals guard
 * for contracts that misreport — otherwise the on-chain values are used as-is.
 */
export function mapTokenRead(read: TokenRead, chainId: number): Holding | null {
  if (read.balance <= 0n) return null;

  const bareToken = read.token.toLowerCase().replace(/^0x/, "");
  const override = curatedToken(chainId, bareToken);

  const decimals = override?.decimals ?? read.decimals;
  const balance = read.balance.toString();

  return {
    tokenAddress: `0x${bareToken}`,
    symbol: override?.symbol ?? read.symbol,
    name: override?.name ?? read.name,
    decimals,
    balance,
    balanceFormatted: formatTokenAmount(balance, decimals),
  };
}

/** Sort holdings by formatted balance descending (largest position first). */
export function sortHoldings(holdings: Holding[]): Holding[] {
  return [...holdings].sort((a, b) => {
    const av = Number(a.balanceFormatted);
    const bv = Number(b.balanceFormatted);
    if (Number.isNaN(av) || Number.isNaN(bv)) return 0;
    return bv - av;
  });
}
