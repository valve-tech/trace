import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatTokenAmount,
  mapTokenRead,
  sortHoldings,
  type Holding,
  type TokenRead,
} from "../../src/services/portfolio/transforms.js";
import { curatedToken, curatedTokens } from "../../src/services/portfolio/curatedTokens.js";

/**
 * Pure-transform tests for portfolio holdings — no DB, no RPC. Pins the
 * on-chain-read → Holding mapping (all tokens, curated override, zero-balance
 * drops), amount formatting, ordering, and the curated override registry.
 */

const HEX_BARE = "2b591e99afe9f32eaa6214f7b7629768c40eeb39"; // curated 369, 8 decimals
const WPLS_BARE = "a1077a294dde1b09bb078844df40758a5d0f9a27"; // curated 369, 18 decimals
const RANDOM_BARE = "dead00000000000000000000000000000000beef"; // not curated

const read = (over: Partial<TokenRead> & { token: string }): TokenRead => ({
  balance: 0n,
  decimals: 18,
  symbol: "",
  name: "",
  ...over,
});

describe("curatedTokens (override registry)", () => {
  it("369 has the verified mainnet overrides; HEX is 8 decimals", () => {
    const t = curatedTokens(369);
    assert.equal(t.length, 4);
    assert.equal(curatedToken(369, HEX_BARE)?.decimals, 8);
    assert.equal(curatedToken(369, "0x" + WPLS_BARE)?.symbol, "WPLS");
  });
  it("chains without overrides return an empty set", () => {
    assert.deepEqual(curatedTokens(943), []);
    assert.equal(curatedToken(943, HEX_BARE), undefined);
  });
});

describe("mapTokenRead", () => {
  it("maps a read using on-chain metadata for a non-curated token", () => {
    const h = mapTokenRead(
      read({ token: RANDOM_BARE, balance: 5_000000000000000000n, decimals: 18, symbol: "RND", name: "Random" }),
      369,
    );
    assert.ok(h);
    assert.equal(h!.symbol, "RND");
    assert.equal(h!.name, "Random");
    assert.equal(h!.tokenAddress, "0x" + RANDOM_BARE);
    assert.equal(h!.balanceFormatted, "5");
  });

  it("a curated entry overrides on-chain metadata (label + decimals guard)", () => {
    // HEX is curated as 8 decimals; even if the chain misreports 18, curated wins.
    const h = mapTokenRead(
      read({ token: HEX_BARE, balance: 150000000n, decimals: 18, symbol: "WRONG", name: "Wrong" }),
      369,
    );
    assert.equal(h!.symbol, "HEX");
    assert.equal(h!.decimals, 8);
    assert.equal(h!.balanceFormatted, "1.5"); // 1.5e8 at 8dp
  });

  it("tolerates a 0x-prefixed token in the read", () => {
    const h = mapTokenRead(
      read({ token: "0x" + WPLS_BARE, balance: 2_000000000000000000n, decimals: 18, symbol: "WPLS", name: "Wrapped Pulse" }),
      369,
    );
    assert.equal(h!.tokenAddress, "0x" + WPLS_BARE);
    assert.equal(h!.balanceFormatted, "2");
  });

  it("drops non-positive balances", () => {
    assert.equal(mapTokenRead(read({ token: HEX_BARE, balance: 0n }), 369), null);
    assert.equal(mapTokenRead(read({ token: RANDOM_BARE, balance: -1n }), 369), null);
  });

  it("keeps non-curated tokens — all tokens, not a curated allowlist", () => {
    const h = mapTokenRead(read({ token: RANDOM_BARE, balance: 5n, decimals: 0, symbol: "DEAD", name: "Dead" }), 943);
    assert.ok(h);
    assert.equal(h!.symbol, "DEAD");
    assert.equal(h!.balanceFormatted, "5");
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
