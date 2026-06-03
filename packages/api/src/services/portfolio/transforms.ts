import { formatUnits } from "viem";

/**
 * Pure transforms for portfolio holdings — no daemon, no network, so they're
 * unit-testable in isolation. The service layer (`./holdings.ts`) wires these
 * to chifra responses.
 */

/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface Holding {
  /** Lowercased token contract address. */
  tokenAddress: string;
  /** Best-effort — chifra often returns empty; caller falls back to address. */
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
  /** Distinct token contracts discovered from the holder's transfer logs. */
  discoveredTokens: number;
  /** True when log discovery hit the record cap — older tokens may be missed. */
  truncated: boolean;
}

/** A padded 32-byte topic carries an address in its low 20 bytes. */
export function topicToAddress(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase();
}

/** Minimal shape of a chifra log row we read. */
interface LogRow {
  address?: string;
  topics?: string[];
}

/**
 * From a holder's logs, return the distinct token-contract addresses where the
 * holder was a party to an ERC-20/721 `Transfer` (topic1=from or topic2=to).
 * Lowercased, de-duplicated, insertion-ordered (newest-first if logs are).
 */
export function extractHeldTokens(logs: LogRow[], holder: string): string[] {
  const want = holder.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const log of logs) {
    const topics = log.topics ?? [];
    if (topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    const from = topics[1] ? topicToAddress(topics[1]) : "";
    const to = topics[2] ? topicToAddress(topics[2]) : "";
    if (from !== want && to !== want) continue;
    const token = (log.address ?? "").toLowerCase();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/** Minimal shape of a chifra `token` row we read. */
interface TokenRow {
  address?: string;
  holder?: string;
  balance?: string;
  decimals?: number;
  name?: string;
  symbol?: string;
}

/**
 * Map a chifra token row to a `Holding`, or null when it's not a usable
 * nonzero ERC-20 balance for this holder. Defensive against the empty
 * name/symbol the daemon frequently returns and against the token row
 * accidentally being the holder address itself.
 */
export function mapTokenRow(row: TokenRow, holder: string): Holding | null {
  const tokenAddress = (row.address ?? "").toLowerCase();
  if (!tokenAddress) return null;
  if (tokenAddress === holder.toLowerCase()) return null;
  if (row.holder && row.holder.toLowerCase() !== holder.toLowerCase()) return null;

  const balance = (row.balance ?? "0").trim();
  if (balance === "" || balance === "0") return null;

  const decimals = typeof row.decimals === "number" ? row.decimals : 18;
  return {
    tokenAddress,
    symbol: (row.symbol ?? "").trim(),
    name: (row.name ?? "").trim(),
    decimals,
    balance,
    balanceFormatted: formatTokenAmount(balance, decimals),
  };
}

/** Decimals-adjust a raw integer balance; "0" on any parse failure. */
export function formatTokenAmount(balance: string, decimals: number): string {
  try {
    return formatUnits(BigInt(balance), decimals);
  } catch {
    return "0";
  }
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
