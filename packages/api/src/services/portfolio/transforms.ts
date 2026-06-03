import { formatUnits } from "viem";
import { curatedToken, type CuratedToken } from "./curatedTokens.js";

/**
 * Pure transforms for portfolio holdings — no DB, no network, so they're
 * unit-testable in isolation. The service layer (`./holdings.ts`) wires these
 * to the substreams sink rows (`token_balance`) + the per-chain curated token
 * metadata.
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
  /** True when the substreams sink table wasn't found (not indexed yet). */
  indexed: boolean;
}

/** A row from the substreams sink `token_balance` table. */
export interface BalanceRow {
  /** lowercase hex, no 0x (the substreams store key form). */
  token: string;
  /** raw integer balance as a string (Postgres numeric). */
  balance: string;
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
 * Map a sink balance row to a `Holding`, resolving symbol/name/decimals from
 * the per-chain curated metadata. Returns null for zero balances and for
 * tokens not in the curated set (the sink only tracks curated tokens, but
 * guard anyway).
 */
export function mapBalanceRow(row: BalanceRow, chainId: number): Holding | null {
  const balance = (row.balance ?? "0").trim();
  if (!balance || balance === "0" || /^0+$/.test(balance)) return null;

  const bareToken = row.token.toLowerCase().replace(/^0x/, "");
  const meta: CuratedToken | undefined = curatedToken(chainId, bareToken);
  if (!meta) return null;

  return {
    tokenAddress: meta.address,
    symbol: meta.symbol,
    name: meta.name,
    decimals: meta.decimals,
    balance,
    balanceFormatted: formatTokenAmount(balance, meta.decimals),
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
