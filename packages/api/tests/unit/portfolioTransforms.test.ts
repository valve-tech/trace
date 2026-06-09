import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  mapHolding,
  sortHoldings,
  type HeldBalance,
  type Holding,
  type TokenMeta,
} from "../../src/services/portfolio/transforms.js";
import { curatedToken, curatedTokens } from "../../src/services/portfolio/curatedTokens.js";

/**
 * Pure-transform tests for portfolio holdings — no DB, no RPC. Pins the
 * (archive balance + chain metadata) → Holding mapping (all tokens, curated
 * override, zero-balance drops, drop-on-unresolvable-decimals), ordering, and
 * the curated override registry. Holdings carry the RAW integer balance +
 * decimals (no pre-scaled value); scaling is the UI's job.
 */

const HEX_BARE = "2b591e99afe9f32eaa6214f7b7629768c40eeb39"; // curated 369, 8 decimals
const WPLS_BARE = "a1077a294dde1b09bb078844df40758a5d0f9a27"; // curated 369, 18 decimals
const RANDOM_BARE = "dead00000000000000000000000000000000beef"; // not curated

const held = (token: string, value: bigint): HeldBalance => ({ token, balance: value });
const meta = (over: Partial<TokenMeta> & { token: string }): TokenMeta => ({
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

describe("mapHolding", () => {
  it("combines an archive balance with chain metadata for a non-curated token", () => {
    const h = mapHolding(
      held(RANDOM_BARE, 5_000000000000000000n),
      meta({ token: RANDOM_BARE, decimals: 18, symbol: "RND", name: "Random" }),
      369,
    );
    assert.ok(h);
    assert.equal(h!.symbol, "RND");
    assert.equal(h!.name, "Random");
    assert.equal(h!.tokenAddress, "0x" + RANDOM_BARE);
    assert.equal(h!.balance, "5000000000000000000"); // raw, unscaled
    assert.equal(h!.decimals, 18);
  });

  it("a curated entry overrides chain metadata (label + decimals guard)", () => {
    // HEX is curated as 8 decimals; even if the chain misreports 18, curated wins.
    const h = mapHolding(
      held(HEX_BARE, 150000000n),
      meta({ token: HEX_BARE, decimals: 18, symbol: "WRONG", name: "Wrong" }),
      369,
    );
    assert.equal(h!.symbol, "HEX");
    assert.equal(h!.decimals, 8);
    assert.equal(h!.balance, "150000000"); // raw 1.5e8; UI scales at 8dp → 1.5
  });

  it("uses curated decimals when metadata is missing (read failed)", () => {
    const h = mapHolding(held(HEX_BARE, 150000000n), undefined, 369);
    assert.equal(h!.symbol, "HEX");
    assert.equal(h!.decimals, 8);
    assert.equal(h!.balance, "150000000");
  });

  it("drops a non-curated token when decimals can't be resolved", () => {
    assert.equal(mapHolding(held(RANDOM_BARE, 5n), undefined, 369), null);
  });

  it("tolerates a 0x-prefixed token in either input", () => {
    const h = mapHolding(
      held("0x" + WPLS_BARE, 2_000000000000000000n),
      meta({ token: "0x" + WPLS_BARE, decimals: 18, symbol: "WPLS", name: "Wrapped Pulse" }),
      369,
    );
    assert.equal(h!.tokenAddress, "0x" + WPLS_BARE);
    assert.equal(h!.balance, "2000000000000000000");
  });

  it("drops non-positive balances", () => {
    assert.equal(mapHolding(held(HEX_BARE, 0n), meta({ token: HEX_BARE, decimals: 8 }), 369), null);
    assert.equal(mapHolding(held(RANDOM_BARE, -1n), meta({ token: RANDOM_BARE }), 369), null);
  });

  it("keeps non-curated tokens — all tokens, not a curated allowlist", () => {
    const h = mapHolding(held(RANDOM_BARE, 5n), meta({ token: RANDOM_BARE, decimals: 0, symbol: "DEAD", name: "Dead" }), 943);
    assert.ok(h);
    assert.equal(h!.symbol, "DEAD");
    assert.equal(h!.balance, "5");
  });
});

describe("sortHoldings", () => {
  const mk = (balance: string, decimals = 18, symbol = ""): Holding => ({
    tokenAddress: "0x0",
    symbol,
    name: "",
    decimals,
    balance,
  });

  it("orders by human balance descending (same decimals)", () => {
    const sorted = sortHoldings([
      mk("5000000000000000000"),
      mk("100000000000000000000"),
      mk("20000000000000000000"),
    ]);
    assert.deepEqual(sorted.map((h) => h.balance), [
      "100000000000000000000",
      "20000000000000000000",
      "5000000000000000000",
    ]);
  });

  it("compares across decimals exactly in bigint (no Number() drift)", () => {
    // 2 WPLS (18dp) vs 3 HEX (8dp): 3 HEX is the larger human amount.
    const wpls = mk("2000000000000000000", 18, "WPLS");
    const hex = mk("300000000", 8, "HEX");
    assert.deepEqual(sortHoldings([wpls, hex]).map((h) => h.symbol), [
      "HEX",
      "WPLS",
    ]);
  });

  it("stays correct past 2^53 — a hair more is ordered first", () => {
    // Two near-equal huge balances differing by 1 base unit; Number() would
    // collapse them to equal and lose the ordering.
    const big = (10n ** 30n).toString();
    const bigPlusOne = (10n ** 30n + 1n).toString();
    const sorted = sortHoldings([mk(big, 18, "A"), mk(bigPlusOne, 18, "B")]);
    assert.deepEqual(sorted.map((h) => h.symbol), ["B", "A"]);
  });
});
