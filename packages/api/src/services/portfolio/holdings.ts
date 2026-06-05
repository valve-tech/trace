import { erc20Abi, formatUnits, type Address } from "viem";
import { readCache, writeCache } from "../chifra/cache.js";
import { getChain } from "../chains/registry.js";
import { getRpcClient } from "../chains/clients.js";
import { queryBalances } from "./balanceSource.js";
import {
  mapHolding,
  sortHoldings,
  type HeldBalance,
  type Holding,
  type HoldingsResult,
  type NativeHolding,
  type TokenMeta,
} from "./transforms.js";

/**
 * Portfolio holdings: all tokens a wallet holds, no curation.
 *
 * Two stages, with balance and metadata coming from *different* sources:
 *   1. BALANCES — the current balance per token comes from the `balance_changes`
 *      archive (`argMax(new_balance)` per `(contract, owner)`), populated by the
 *      monorepo's erc20-balance-changes substreams sink. Storage-diff truth, so
 *      no read-time `balanceOf` and correct for rebasing / fee-on-transfer
 *      tokens. If the archive isn't queryable for this chain yet, balances are
 *      null → `indexed: false` and we still return the native balance.
 *   2. METADATA — decimals/symbol/name for the held tokens, read from the chain
 *      (immutable, so cacheable). Decoupled from balance: the archive says how
 *      much, the chain says what it is.
 *
 * Native balance is a trivial RPC point query. Results are cached briefly per
 * (chainId, holder).
 */

/** Canonical Multicall3 — same address on every chain via the deterministic deployer. */
const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

/** Deps are injected so the service is unit-testable without a data source or RPC. */
export interface HoldingsDeps {
  /**
   * Held tokens + current balance from the balance_changes archive. `null` when
   * the archive isn't queryable for this chain yet (not indexed); `[]` when it
   * is but the holder has no positive balances.
   */
  queryBalances: (chainId: number, holderBare: string) => Promise<HeldBalance[] | null>;
  /**
   * Display metadata (decimals/symbol/name) for the held tokens, batched. One
   * entry per token that responded to `decimals`; tokens that don't are simply
   * absent (and dropped downstream when no curated override supplies decimals).
   * Balance does NOT come from here.
   */
  readMetadata: (chainId: number, tokens: string[]) => Promise<TokenMeta[]>;
  /** Native balance (wei) for a holder. */
  nativeBalance: (chainId: number, holder: string) => Promise<bigint>;
}

const defaultDeps: HoldingsDeps = {
  queryBalances,
  async readMetadata(chainId, tokens) {
    if (tokens.length === 0) return [];
    const client = getRpcClient(chainId);
    const contracts = tokens.flatMap((t) => {
      const address = `0x${t.replace(/^0x/, "")}` as Address;
      return [
        { address, abi: erc20Abi, functionName: "decimals" } as const,
        { address, abi: erc20Abi, functionName: "symbol" } as const,
        { address, abi: erc20Abi, functionName: "name" } as const,
      ];
    });

    const results = await client.multicall({
      contracts,
      allowFailure: true,
      multicallAddress: MULTICALL3,
    });

    const metas: TokenMeta[] = [];
    tokens.forEach((token, i) => {
      const base = i * 3;
      const dec = results[base];
      const sym = results[base + 1];
      const nam = results[base + 2];
      // decimals is required to format; a token that can't answer it is dropped
      // (unless a curated override supplies decimals in mapHolding).
      if (dec?.status !== "success") return;
      metas.push({
        token,
        decimals: Number(dec.result),
        symbol: sym?.status === "success" ? String(sym.result) : "",
        name: nam?.status === "success" ? String(nam.result) : "",
      });
    });
    return metas;
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

  const balances = await deps.queryBalances(chainId, bare);
  const indexed = balances !== null;

  // Archive balances are already positive (the query filters `HAVING bal > 0`),
  // but guard anyway so a looser source can't surface dust/zero rows.
  const held = (balances ?? []).filter((b) => b.balance > 0n);
  const metas = held.length > 0 ? await deps.readMetadata(chainId, held.map((b) => b.token)) : [];
  const metaByToken = new Map(metas.map((m) => [bareHex(m.token), m]));

  const holdings: Holding[] = sortHoldings(
    held
      .map((b) => mapHolding(b, metaByToken.get(bareHex(b.token)), chainId))
      .filter((h): h is Holding => h !== null),
  );

  const native = await resolveNative(deps, chainId, addr, nativeSymbol);

  const result: HoldingsResult = { chainId, address: addr, native, holdings, indexed };
  writeCache(cacheKey, result);
  return result;
}

/** Bare lowercase hex (no 0x) — the archive/metadata key form for joins. */
function bareHex(token: string): string {
  return token.toLowerCase().replace(/^0x/, "");
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
