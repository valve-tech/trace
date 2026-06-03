import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatTokenAmount,
  mapBalanceRow,
  sortHoldings,
  type Holding,
} from "../../src/services/portfolio/transforms.js";
import { curatedToken, curatedTokens } from "../../src/services/portfolio/curatedTokens.js";

/**
 * Pure-transform tests for portfolio holdings — no DB. Pins the sink-row →
 * Holding mapping (curated metadata join, zero-balance drops), amount
 * formatting, ordering, and the curated token registry.
 */

const HEX_BARE = "2b591e99afe9f32eaa6214f7b7629768c40eeb39"; // 8 decimals
const WPLS_BARE = "a1077a294dde1b09bb078844df40758a5d0f9a27"; // 18 decimals

describe("curatedTokens", () => {
  it("369 has the verified mainnet set; HEX is 8 decimals", () => {
    const t = curatedTokens(369);
    assert.equal(t.length, 4);
    assert.equal(curatedToken(369, HEX_BARE)?.decimals, 8);
    assert.equal(curatedToken(369, "0x" + WPLS_BARE)?.symbol, "WPLS");
  });
  it("unknown chains have no curated tokens", () => {
    assert.deepEqual(curatedTokens(943), []);
    assert.equal(curatedToken(943, HEX_BARE), undefined);
  });
});

describe("mapBalanceRow", () => {
  it("maps a sink row to a Holding via curated metadata, formatting by decimals", () => {
    const h = mapBalanceRow({ token: HEX_BARE, balance: "150000000" }, 369); // 1.5 HEX (8dp)
    assert.ok(h);
    assert.equal(h!.symbol, "HEX");
    assert.equal(h!.decimals, 8);
    assert.equal(h!.tokenAddress, "0x" + HEX_BARE);
    assert.equal(h!.balanceFormatted, "1.5");
  });

  it("tolerates a 0x-prefixed token in the row", () => {
    const h = mapBalanceRow({ token: "0x" + WPLS_BARE, balance: "2000000000000000000" }, 369);
    assert.equal(h!.symbol, "WPLS");
    assert.equal(h!.balanceFormatted, "2");
  });

  it("drops zero balances (including all-zeros strings)", () => {
    assert.equal(mapBalanceRow({ token: HEX_BARE, balance: "0" }, 369), null);
    assert.equal(mapBalanceRow({ token: HEX_BARE, balance: "000" }, 369), null);
  });

  it("drops tokens not in the curated set", () => {
    assert.equal(mapBalanceRow({ token: "dead".padEnd(40, "0"), balance: "5" }, 369), null);
  });

  it("drops everything on a chain with no curated set", () => {
    assert.equal(mapBalanceRow({ token: HEX_BARE, balance: "5" }, 943), null);
  });
});

describe("formatTokenAmount", () => {
  it("decimals-adjusts", () => {
    assert.equal(formatTokenAmount("1000000", 6), "1");
  });
  it("returns '0' on a non-numeric balance", () => {
    assert.equal(formatTokenAmount("nope", 18), "0");
  });
});

describe("sortHoldings", () => {
  it("orders by formatted balance descending", () => {
    const mk = (formatted: string): Holding => ({
      tokenAddress: "0x0",
      symbol: "",
      name: "",
      decimals: 18,
      balance: "0",
      balanceFormatted: formatted,
    });
    const sorted = sortHoldings([mk("5"), mk("100"), mk("20")]);
    assert.deepEqual(sorted.map((h) => h.balanceFormatted), ["100", "20", "5"]);
  });
});
