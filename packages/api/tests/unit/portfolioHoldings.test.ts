import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { getHoldings, type HoldingsDeps } from "../../src/services/portfolio/holdings.js";
import { invalidateChifraCache } from "../../src/services/chifra/index.js";
import type { BalanceRow } from "../../src/services/portfolio/transforms.js";

/**
 * Service-level tests for getHoldings with injected deps (no DB, no RPC).
 * Exercises the sink-row → holdings mapping, native balance, the
 * indexed-vs-not signal (queryBalances null vs []), graceful native failure,
 * and the TTL cache.
 */

const HOLDER = "0x9cd83be15a79646a3d22b81fc8ddf7b7240a62cb";
const HEX = "2b591e99afe9f32eaa6214f7b7629768c40eeb39"; // 8 decimals
const WPLS = "a1077a294dde1b09bb078844df40758a5d0f9a27"; // 18 decimals

interface FakeOpts {
  rows?: BalanceRow[] | null;
  native?: bigint;
  nativeThrows?: boolean;
}

function makeDeps(opts: FakeOpts): { deps: HoldingsDeps; counts: { q: number; n: number } } {
  const counts = { q: 0, n: 0 };
  const deps: HoldingsDeps = {
    async queryBalances() {
      counts.q++;
      return opts.rows === undefined ? [] : opts.rows;
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
  it("maps sink rows to holdings (sorted desc) + native, indexed=true", async () => {
    const { deps } = makeDeps({
      rows: [
        { token: HEX, balance: "100000000" }, // 1 HEX
        { token: WPLS, balance: "5000000000000000000" }, // 5 WPLS
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
});

describe("getHoldings — not indexed vs empty", () => {
  it("queryBalances null → indexed=false, native still returned", async () => {
    const { deps } = makeDeps({ rows: null, native: 1000000000000000000n });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.indexed, false);
    assert.equal(r.holdings.length, 0);
    assert.equal(r.native.balanceFormatted, "1");
  });

  it("queryBalances [] → indexed=true, no holdings (synced, holder empty)", async () => {
    const { deps } = makeDeps({ rows: [], native: 0n });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.indexed, true);
    assert.equal(r.holdings.length, 0);
  });

  it("drops non-curated rows (e.g. 943 has no curated set)", async () => {
    const { deps } = makeDeps({ rows: [{ token: HEX, balance: "5" }], native: 0n });
    const r = await getHoldings(HOLDER, 943, deps);
    assert.equal(r.indexed, true);
    assert.equal(r.holdings.length, 0); // HEX not curated on 943
    assert.equal(r.native.symbol, "v4PLS");
  });
});

describe("getHoldings — native is non-fatal", () => {
  it("native RPC failure degrades to zero, holdings still returned", async () => {
    const { deps } = makeDeps({ rows: [{ token: HEX, balance: "100000000" }], nativeThrows: true });
    const r = await getHoldings(HOLDER, 369, deps);
    assert.equal(r.holdings.length, 1);
    assert.equal(r.native.balanceFormatted, "0");
  });
});

describe("getHoldings — cache", () => {
  it("serves the second call from cache (no re-query)", async () => {
    const { deps, counts } = makeDeps({ rows: [{ token: HEX, balance: "100000000" }], native: 0n });
    await getHoldings(HOLDER, 369, deps);
    await getHoldings(HOLDER, 369, deps);
    assert.equal(counts.q, 1);
    assert.equal(counts.n, 1);
  });
});
