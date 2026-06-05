import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { getHoldings, type HoldingsDeps } from "../../src/services/portfolio/holdings.js";
import { invalidateChifraCache } from "../../src/services/chifra/index.js";
import type { HeldBalance, TokenMeta } from "../../src/services/portfolio/transforms.js";

/**
 * Service-level tests for getHoldings with injected deps (no data source, no
 * RPC). Exercises archive balances → metadata reads → holdings mapping, the
 * indexed-vs-not signal (queryBalances null vs []), zero-balance filtering, the
 * skip of readMetadata when there are no balances, graceful native failure, and
 * the cache.
 */

const HOLDER = "0x9cd83be15a79646a3d22b81fc8ddf7b7240a62cb";
const HEX = "2b591e99afe9f32eaa6214f7b7629768c40eeb39"; // curated 369, 8 decimals
const WPLS = "a1077a294dde1b09bb078844df40758a5d0f9a27"; // curated 369, 18 decimals
const RANDOM = "dead00000000000000000000000000000000beef"; // not curated

const balance = (token: string, value: bigint): HeldBalance => ({ token, balance: value });
const meta = (over: Partial<TokenMeta> & { token: string }): TokenMeta => ({
  decimals: 18,
  symbol: "",
  name: "",
  ...over,
});

interface FakeOpts {
  balances?: HeldBalance[] | null;
  metas?: TokenMeta[];
  native?: bigint;
  nativeThrows?: boolean;
}

function makeDeps(opts: FakeOpts): { deps: HoldingsDeps; counts: { b: number; m: number; n: number } } {
  const counts = { b: 0, m: 0, n: 0 };
  const deps: HoldingsDeps = {
    async queryBalances() {
      counts.b++;
      return opts.balances === undefined ? [] : opts.balances;
    },
    async readMetadata() {
      counts.m++;
      return opts.metas ?? [];
    },
    async nativeBalance() {
      counts.n++;
      if (opts.nativeThrows) throw new Error("rpc down");
      return opts.native ?? 0n;
    },
  };
  return { deps, counts };
}

beforeEach(() => invalidateChifraCache());

describe("getHoldings — happy path", () => {
  it("reads archive balances + metadata, maps to holdings (sorted desc) + native", async () => {
    const { deps } = makeDeps({
      balances: [balance(HEX, 100000000n), balance(WPLS, 5_000000000000000000n)], // 1 HEX (8dp), 5 WPLS
      metas: [
        meta({ token: HEX, decimals: 8, symbol: "HEX", name: "HEX" }),
        meta({ token: WPLS, decimals: 18, symbol: "WPLS", name: "Wrapped Pulse" }),
      ],
      native: 40_000000000000000000n, // 40 PLS
    });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.chainId, 369);
    assert.equal(r.address, HOLDER);
    assert.equal(r.indexed, true);
    assert.equal(r.holdings.length, 2);
    assert.equal(r.holdings[0]!.symbol, "WPLS"); // 5 > 1
    assert.equal(r.holdings[0]!.balanceFormatted, "5");
    assert.equal(r.holdings[1]!.symbol, "HEX");
    assert.equal(r.native.symbol, "PLS");
    assert.equal(r.native.balanceFormatted, "40");
  });

  it("includes non-curated tokens (all tokens, not an allowlist)", async () => {
    const { deps } = makeDeps({
      balances: [balance(RANDOM, 7n)],
      metas: [meta({ token: RANDOM, decimals: 0, symbol: "RND", name: "Random" })],
    });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.holdings.length, 1);
    assert.equal(r.holdings[0]!.symbol, "RND");
  });

  it("keeps a held token via curated decimals when its metadata read failed", async () => {
    // Balance present in the archive, but the metadata multicall returned nothing
    // for it. HEX is curated (8 decimals) → still displayed, correctly formatted.
    const { deps } = makeDeps({ balances: [balance(HEX, 150000000n)], metas: [] });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.holdings.length, 1);
    assert.equal(r.holdings[0]!.symbol, "HEX");
    assert.equal(r.holdings[0]!.balanceFormatted, "1.5");
  });

  it("drops a held token with no curated override and no resolvable decimals", async () => {
    // Non-curated token, metadata read failed → can't format → dropped.
    const { deps } = makeDeps({ balances: [balance(RANDOM, 5n)], metas: [] });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.indexed, true);
    assert.equal(r.holdings.length, 0);
  });
});

describe("getHoldings — not indexed vs empty", () => {
  it("queryBalances null → indexed=false, native still returned, no metadata read", async () => {
    const { deps, counts } = makeDeps({ balances: null, native: 1000000000000000000n });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.indexed, false);
    assert.equal(r.holdings.length, 0);
    assert.equal(r.native.balanceFormatted, "1");
    assert.equal(counts.m, 0); // no balances → don't read metadata
  });

  it("queryBalances [] → indexed=true, no metadata read, no holdings", async () => {
    const { deps, counts } = makeDeps({ balances: [], native: 0n });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.indexed, true);
    assert.equal(r.holdings.length, 0);
    assert.equal(counts.m, 0); // no balances → skip the metadata multicall
  });

  it("drops non-positive archive balances (token fully exited)", async () => {
    const { deps, counts } = makeDeps({ balances: [balance(HEX, 0n)] });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.indexed, true);
    assert.equal(r.holdings.length, 0);
    assert.equal(counts.m, 0); // nothing positive to label
  });
});

describe("getHoldings — native is non-fatal", () => {
  it("native RPC failure degrades to zero, holdings still returned", async () => {
    const { deps } = makeDeps({
      balances: [balance(HEX, 100000000n)],
      metas: [meta({ token: HEX, decimals: 8, symbol: "HEX" })],
      nativeThrows: true,
    });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.holdings.length, 1);
    assert.equal(r.native.balanceFormatted, "0");
  });
});

describe("getHoldings — cache", () => {
  it("serves the second call from cache (no re-query)", async () => {
    const { deps, counts } = makeDeps({
      balances: [balance(HEX, 100000000n)],
      metas: [meta({ token: HEX, decimals: 8, symbol: "HEX" })],
      native: 0n,
    });
    await getHoldings(HOLDER, 369, deps);
    await getHoldings(HOLDER, 369, deps);
    assert.equal(counts.b, 1);
    assert.equal(counts.m, 1);
    assert.equal(counts.n, 1);
  });
});
