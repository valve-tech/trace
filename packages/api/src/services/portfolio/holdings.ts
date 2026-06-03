import { formatUnits, type Address } from "viem";
import { pool } from "../pool.js";
import { readCache, writeCache } from "../chifra/cache.js";
import { getChain } from "../chains/registry.js";
import { getRpcClient } from "../chains/clients.js";
import {
  mapBalanceRow,
  sortHoldings,
  type BalanceRow,
  type Holding,
  type HoldingsResult,
  type NativeHolding,
} from "./transforms.js";

/**
 * Portfolio holdings from the substreams sink.
 *
 * Token balances are read from the per-chain `holdings_<chainId>.token_balance`
 * table that `substreams-sink-sql` populates from the firehose (see
 * `substreams/`). Substreams streams from genesis, so once synced the table is
 * the complete, authoritative holder→token→balance set for the curated tokens
 * — no RPC enumeration, no seed-on-sight. If the schema/table doesn't exist
 * yet (sink not run for this chain), token holdings come back empty and
 * `indexed: false`, and we still return the native balance.
 *
 * Native balance is read directly from the chain RPC (a trivial point query,
 * not an enumeration problem). Results are cached briefly per (chainId, holder).
 */

/** Deps are injected so the service is unit-testable without a DB or RPC. */
export interface HoldingsDeps {
  /**
   * Sink balance rows for a holder (bare lowercase hex, no 0x). Returns `null`
   * when the chain's sink table doesn't exist yet (not indexed), `[]` when it
   * exists but the holder has no rows.
   */
  queryBalances: (chainId: number, holderBare: string) => Promise<BalanceRow[] | null>;
  /** Native balance (wei) for a holder. */
  nativeBalance: (chainId: number, holder: string) => Promise<bigint>;
}

/** Postgres schema substreams-sink-sql writes this chain's holdings into. */
export function holdingsSchema(chainId: number): string {
  return `holdings_${chainId}`;
}

const defaultDeps: HoldingsDeps = {
  async queryBalances(chainId, holderBare) {
    const schema = holdingsSchema(chainId);
    try {
      // Schema/table are sink-managed; identifier is derived from a numeric
      // chainId (not user input), so interpolation is safe here.
      const res = await pool.query<BalanceRow>(
        `SELECT token, balance::text AS balance
           FROM ${schema}.token_balance
          WHERE holder = $1 AND balance <> 0`,
        [holderBare],
      );
      return res.rows;
    } catch {
      // undefined_table / undefined_schema (or any read failure) → treat as
      // not indexed yet.
      return null;
    }
  },
  async nativeBalance(chainId, holder) {
    return getRpcClient(chainId).getBalance({ address: holder as Address });
  },
};

export async function getHoldings(
  holder: string,
  chainId: number,
  deps: HoldingsDeps = defaultDeps,
): Promise<HoldingsResult> {
  const addr = holder.toLowerCase();
  const bare = addr.replace(/^0x/, "");

  const cacheKey = `holdings:${chainId}:${addr}`;
  const cached = readCache<HoldingsResult>(cacheKey);
  if (cached) return cached;

  // Touch the registry so an unsupported chain throws before any work.
  const { nativeSymbol } = getChain(chainId);

  const rows = await deps.queryBalances(chainId, bare);
  const indexed = rows !== null;
  const holdings: Holding[] = sortHoldings(
    (rows ?? [])
      .map((r) => mapBalanceRow(r, chainId))
      .filter((h): h is Holding => h !== null),
  );

  const native = await resolveNative(deps, chainId, addr, nativeSymbol);

  const result: HoldingsResult = { chainId, address: addr, native, holdings, indexed };
  writeCache(cacheKey, result);
  return result;
}

async function resolveNative(
  deps: HoldingsDeps,
  chainId: number,
  holder: string,
  symbol: string,
): Promise<NativeHolding> {
  let balance = "0";
  try {
    balance = (await deps.nativeBalance(chainId, holder)).toString();
  } catch {
    // native is non-fatal — degrade to zero
  }
  let balanceFormatted = "0";
  try {
    balanceFormatted = formatUnits(BigInt(balance), 18);
  } catch {
    balance = "0";
  }
  return { symbol, balance, balanceFormatted };
}
