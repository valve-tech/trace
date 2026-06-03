import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { getHoldings, type HoldingsDeps } from "../../src/services/portfolio/holdings.js";
import { invalidateChifraCache } from "../../src/services/chifra/index.js";
import type { TokenRead } from "../../src/services/portfolio/transforms.js";

/**
 * Service-level tests for getHoldings with injected deps (no DB, no RPC).
 * Exercises discovery → on-chain reads → holdings mapping, the indexed-vs-not
 * signal (discoverTokens null vs []), zero-balance filtering, the skip of
 * readTokens when discovery is empty, graceful native failure, and the cache.
 */

const HOLDER = "0x9cd83be15a79646a3d22b81fc8ddf7b7240a62cb";
const HEX = "2b591e99afe9f32eaa6214f7b7629768c40eeb39"; // curated 369, 8 decimals
const WPLS = "a1077a294dde1b09bb078844df40758a5d0f9a27"; // curated 369, 18 decimals
const RANDOM = "dead00000000000000000000000000000000beef"; // not curated

const read = (over: Partial<TokenRead> & { token: string }): TokenRead => ({
  balance: 0n,
  decimals: 18,
  symbol: "",
  name: "",
  ...over,
});

interface FakeOpts {
  tokens?: string[] | null;
  reads?: TokenRead[];
  native?: bigint;
  nativeThrows?: boolean;
}

function makeDeps(opts: FakeOpts): { deps: HoldingsDeps; counts: { d: number; r: number; n: number } } {
  const counts = { d: 0, r: 0, n: 0 };
  const deps: HoldingsDeps = {
    async discoverTokens() {
      counts.d++;
      return opts.tokens === undefined ? [] : opts.tokens;
    },
    async readTokens() {
      counts.r++;
      return opts.reads ?? [];
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
  it("discovers tokens, reads balances, maps to holdings (sorted desc) + native", async () => {
    const { deps } = makeDeps({
      tokens: [HEX, WPLS],
      reads: [
        read({ token: HEX, balance: 100000000n, decimals: 8, symbol: "HEX", name: "HEX" }), // 1 HEX
        read({ token: WPLS, balance: 5_000000000000000000n, decimals: 18, symbol: "WPLS", name: "Wrapped Pulse" }), // 5
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
      tokens: [RANDOM],
      reads: [read({ token: RANDOM, balance: 7n, decimals: 0, symbol: "RND", name: "Random" })],
    });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.holdings.length, 1);
    assert.equal(r.holdings[0]!.symbol, "RND");
  });
});

describe("getHoldings — not indexed vs empty", () => {
  it("discoverTokens null → indexed=false, native still returned, no reads", async () => {
    const { deps, counts } = makeDeps({ tokens: null, native: 1000000000000000000n });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.indexed, false);
    assert.equal(r.holdings.length, 0);
    assert.equal(r.native.balanceFormatted, "1");
    assert.equal(counts.r, 0); // no discovery result → don't read
  });

  it("discoverTokens [] → indexed=true, no reads, no holdings", async () => {
    const { deps, counts } = makeDeps({ tokens: [], native: 0n });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.indexed, true);
    assert.equal(r.holdings.length, 0);
    assert.equal(counts.r, 0); // empty discovery → skip the multicall
  });

  it("drops zero-balance reads (discovered token the holder fully exited)", async () => {
    const { deps } = makeDeps({ tokens: [HEX], reads: [read({ token: HEX, balance: 0n, decimals: 8 })] });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.indexed, true);
    assert.equal(r.holdings.length, 0);
  });
});

describe("getHoldings — native is non-fatal", () => {
  it("native RPC failure degrades to zero, holdings still returned", async () => {
    const { deps } = makeDeps({
      tokens: [HEX],
      reads: [read({ token: HEX, balance: 100000000n, decimals: 8, symbol: "HEX" })],
      nativeThrows: true,
    });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.holdings.length, 1);
    assert.equal(r.native.balanceFormatted, "0");
  });
});

describe("getHoldings — cache", () => {
  it("serves the second call from cache (no re-discovery)", async () => {
    const { deps, counts } = makeDeps({
      tokens: [HEX],
      reads: [read({ token: HEX, balance: 100000000n, decimals: 8, symbol: "HEX" })],
      native: 0n,
    });
    await getHoldings(HOLDER, 369, deps);
    await getHoldings(HOLDER, 369, deps);
    assert.equal(counts.d, 1);
    assert.equal(counts.r, 1);
    assert.equal(counts.n, 1);
  });
});
