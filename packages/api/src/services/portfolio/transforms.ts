import { formatUnits } from "viem";
import { curatedToken } from "./curatedTokens.js";

/**
 * Pure transforms for portfolio holdings — no DB, no network, so they're
 * unit-testable in isolation. The service layer (`./holdings.ts`) gets each
 * held token's current balance from the `balance_changes` archive (storage-diff
 * truth, no `balanceOf`) and its metadata from a separate chain read, then
 * combines the two through here. Balance and metadata come from *different*
 * sources now, so they're modelled as distinct inputs.
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
  /** True when the balance_changes archive was queryable for this chain. */
  indexed: boolean;
}

/**
 * A held token's current balance, straight from the `balance_changes` archive
 * (`argMax(new_balance)` per `(contract, owner)`). Storage-diff truth — no
 * `balanceOf`, correct for rebasing / fee-on-transfer tokens, and spam-immune
 * (a token that never touches a balance slot never appears).
 */
export interface HeldBalance {
  /** lowercase hex, no 0x (the archive key form). 0x-prefixed is tolerated. */
  token: string;
  /** current raw balance (smallest unit) from the archive. */
  balance: bigint;
}

/**
 * Token display metadata, read separately from the chain (immutable, so
 * cacheable). Decoupled from balance: the archive answers "how much," this
 * answers "what is it." `symbol`/`name` may be empty when a contract doesn't
 * implement them; `decimals` is required to format an amount.
 */
export interface TokenMeta {
  /** lowercase hex, no 0x. 0x-prefixed is tolerated. */
  token: string;
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
 * Combine an archive balance with its (optional) chain metadata into a
 * `Holding`. Returns null when:
 *   - the balance is non-positive (token fully exited), or
 *   - decimals can't be resolved (no curated override *and* the metadata read
 *     failed) — without decimals the amount can't be formatted, so we drop it
 *     rather than display a wrong number. (Rare: most ERC-20s implement
 *     `decimals()`. Flip to a fallback here if showing the raw balance is
 *     preferable to omitting a token the holder provably owns.)
 *
 * A curated registry entry, when present, overrides the chain metadata — clean
 * labels for major tokens and a decimals guard for contracts that misreport.
 */
export function mapHolding(
  held: HeldBalance,
  meta: TokenMeta | undefined,
  chainId: number,
): Holding | null {
  if (held.balance <= 0n) return null;

  const bareToken = held.token.toLowerCase().replace(/^0x/, "");
  const override = curatedToken(chainId, bareToken);

  const decimals = override?.decimals ?? meta?.decimals;
  if (decimals === undefined) return null;

  const balance = held.balance.toString();

  return {
    tokenAddress: `0x${bareToken}`,
    symbol: override?.symbol ?? meta?.symbol ?? "",
    name: override?.name ?? meta?.name ?? "",
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
