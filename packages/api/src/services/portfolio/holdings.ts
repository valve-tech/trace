import { formatUnits } from "viem";
import { type TrueblocksClient } from "@valve-tech/trueblocks-sdk";
import { chifraClient, withRetry } from "../chifra/client.js";
import { readCache, writeCache } from "../chifra/cache.js";
import { getChain } from "../chains/registry.js";
import {
  extractHeldTokens,
  mapTokenRow,
  sortHoldings,
  type Holding,
  type HoldingsResult,
  type NativeHolding,
} from "./transforms.js";

/**
 * Portfolio holdings via TrueBlocks chifra. Three daemon calls, no archive
 * node required (the `export --assets` accounting mode does need archive — see
 * services/chifra/transfers.ts — so we discover the token set from raw
 * `Transfer` logs instead):
 *
 *   1. export.logs(holder) → decode Transfer logs → distinct token contracts
 *      the holder has been a party to. (discovery)
 *   2. tokens([...tokens, holder]) → current balance + decimals per token.
 *      `noZero` drops dust; we re-filter defensively in the transform.
 *   3. state(holder, parts:["balance"]) → native balance.
 *
 * `null` on a discovery/balance failure (mirrors getTokenTransfers); native is
 * best-effort and degrades to zero rather than failing the whole result.
 * Results are cached (TTL, see ../chifra/cache.ts) per (chainId, holder).
 */

/** Cap on logs pulled for discovery — bounds cold-scrape latency + memory. */
const MAX_DISCOVERY_LOGS = 5_000;
/** Cap on distinct token contracts fed to the `tokens` balance call. */
const MAX_TOKENS = 250;

/** The chifra verbs this service needs — narrowed for dependency injection. */
type HoldingsClient = Pick<TrueblocksClient, "tokens" | "state"> & {
  export: Pick<TrueblocksClient["export"], "logs">;
};

interface StateRow {
  balance?: string;
}

export async function getHoldings(
  holder: string,
  chainId: number,
  client: HoldingsClient = chifraClient,
): Promise<HoldingsResult | null> {
  const chain = getChain(chainId).chifraChain;
  const addr = holder.toLowerCase();

  const cacheKey = `holdings:${chainId}:${addr}`;
  const cached = readCache<HoldingsResult>(cacheKey);
  if (cached) return cached;

  // 1. Discover the holder's token universe from Transfer logs.
  let logRes;
  try {
    logRes = await withRetry(() =>
      client.export.logs({
        addrs: [addr],
        reversed: true,
        maxRecords: MAX_DISCOVERY_LOGS,
        chain,
      }),
    );
  } catch {
    return null;
  }
  const logs = (logRes.data ?? []) as { address?: string; topics?: string[] }[];
  const allTokens = extractHeldTokens(logs, addr);
  const truncated = logs.length >= MAX_DISCOVERY_LOGS;
  const tokens = allTokens.slice(0, MAX_TOKENS);

  // 2. Balances + metadata for the discovered set (skip the call when empty).
  let holdings: Holding[] = [];
  if (tokens.length > 0) {
    let tokenRes;
    try {
      tokenRes = await withRetry(() =>
        client.tokens({
          addrs: [...tokens, addr],
          parts: ["name", "symbol", "decimals"],
          noZero: true,
          chain,
        }),
      );
    } catch {
      return null;
    }
    const rows = (tokenRes.data ?? []) as Parameters<typeof mapTokenRow>[0][];
    holdings = sortHoldings(
      rows.map((r) => mapTokenRow(r, addr)).filter((h): h is Holding => h !== null),
    );
  }

  // 3. Native balance — best-effort; a failure here yields a zero native row.
  const native = await getNativeBalance(client, addr, chainId);

  const result: HoldingsResult = {
    chainId,
    address: addr,
    native,
    holdings,
    discoveredTokens: allTokens.length,
    truncated,
  };
  writeCache(cacheKey, result);
  return result;
}

async function getNativeBalance(
  client: HoldingsClient,
  holder: string,
  chainId: number,
): Promise<NativeHolding> {
  const { chifraChain, nativeSymbol } = getChain(chainId);
  let balance = "0";
  try {
    const res = await withRetry(() =>
      client.state({ addrs: [holder], parts: ["balance"], chain: chifraChain }),
    );
    const row = (res.data?.[0] ?? {}) as StateRow;
    balance = (row.balance ?? "0").trim() || "0";
  } catch {
    // leave at "0" — native is non-fatal
  }
  let balanceFormatted = "0";
  try {
    balanceFormatted = formatUnits(BigInt(balance), 18);
  } catch {
    balance = "0";
  }
  return { symbol: nativeSymbol, balance, balanceFormatted };
}
