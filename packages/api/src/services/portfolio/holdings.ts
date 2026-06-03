import { erc20Abi, formatUnits, type Address } from "viem";
import { pool } from "../pool.js";
import { readCache, writeCache } from "../chifra/cache.js";
import { getChain } from "../chains/registry.js";
import { getRpcClient } from "../chains/clients.js";
import {
  mapTokenRead,
  sortHoldings,
  type Holding,
  type HoldingsResult,
  type NativeHolding,
  type TokenRead,
} from "./transforms.js";

/**
 * Portfolio holdings: all tokens a wallet holds, no curation.
 *
 * Two stages, neither of which precomputes balances:
 *   1. DISCOVERY — the set of tokens the holder has ever touched is a
 *      projection of the substreams transfers archive:
 *      `DISTINCT token WHERE sender = $holder OR recipient = $holder`
 *      in `holdings_<chainId>.transfers`. If that table doesn't exist yet
 *      (sink not run for this chain) discovery returns null → `indexed: false`
 *      and we still return the native balance.
 *   2. CURRENT BALANCE — read `balanceOf(holder)` + metadata for each
 *      discovered token in a single multicall. balanceOf is the ground truth
 *      (transfer-sum is wrong for rebasing / fee-on-transfer tokens), so we
 *      never trust accumulated transfer values for the displayed amount.
 *
 * Native balance is a trivial RPC point query. Results are cached briefly per
 * (chainId, holder).
 */

/** Canonical Multicall3 — same address on every chain via the deterministic deployer. */
const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

/** Deps are injected so the service is unit-testable without a DB or RPC. */
export interface HoldingsDeps {
  /**
   * Bare-hex (no 0x) token addresses the holder has touched. `null` when the
   * chain's transfers archive doesn't exist yet (not indexed); `[]` when it
   * exists but the holder appears in no transfer.
   */
  discoverTokens: (chainId: number, holderBare: string) => Promise<string[] | null>;
  /**
   * On-chain reads (balanceOf + metadata) for the discovered tokens, batched.
   * Returns one entry per token that responded to balanceOf + decimals;
   * zero-balance filtering happens in the transform.
   */
  readTokens: (chainId: number, holder: string, tokens: string[]) => Promise<TokenRead[]>;
  /** Native balance (wei) for a holder. */
  nativeBalance: (chainId: number, holder: string) => Promise<bigint>;
}

/** Postgres schema substreams-sink-sql writes this chain's transfers into. */
export function holdingsSchema(chainId: number): string {
  return `holdings_${chainId}`;
}

const defaultDeps: HoldingsDeps = {
  async discoverTokens(chainId, holderBare) {
    const schema = holdingsSchema(chainId);
    try {
      // Schema/table are sink-managed; identifier is derived from a numeric
      // chainId (not user input), so interpolation is safe here.
      const res = await pool.query<{ token: string }>(
        `SELECT DISTINCT token
           FROM ${schema}.transfers
          WHERE sender = $1 OR recipient = $1`,
        [holderBare],
      );
      return res.rows.map((r) => r.token);
    } catch {
      // undefined_table / undefined_schema (or any read failure) → not indexed.
      return null;
    }
  },
  async readTokens(chainId, holder, tokens) {
    if (tokens.length === 0) return [];
    const client = getRpcClient(chainId);
    const holderAddr = holder as Address;
    const contracts = tokens.flatMap((t) => {
      const address = `0x${t.replace(/^0x/, "")}` as Address;
      return [
        { address, abi: erc20Abi, functionName: "balanceOf", args: [holderAddr] } as const,
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

    const reads: TokenRead[] = [];
    tokens.forEach((token, i) => {
      const base = i * 4;
      const bal = results[base];
      const dec = results[base + 1];
      const sym = results[base + 2];
      const nam = results[base + 3];
      // balanceOf + decimals are required; without them we can't display.
      if (bal?.status !== "success" || dec?.status !== "success") return;
      reads.push({
        token,
        balance: bal.result as bigint,
        decimals: Number(dec.result),
        symbol: sym?.status === "success" ? String(sym.result) : "",
        name: nam?.status === "success" ? String(nam.result) : "",
      });
    });
    return reads;
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

  const tokens = await deps.discoverTokens(chainId, bare);
  const indexed = tokens !== null;
  const reads = tokens && tokens.length > 0 ? await deps.readTokens(chainId, addr, tokens) : [];
  const holdings: Holding[] = sortHoldings(
    reads.map((r) => mapTokenRead(r, chainId)).filter((h): h is Holding => h !== null),
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
