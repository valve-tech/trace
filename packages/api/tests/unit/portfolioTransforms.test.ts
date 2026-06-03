import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  TRANSFER_TOPIC,
  extractHeldTokens,
  formatTokenAmount,
  mapTokenRow,
  sortHoldings,
  topicToAddress,
  type Holding,
} from "../../src/services/portfolio/transforms.js";

/**
 * Pure-transform tests for portfolio holdings — no daemon. Pins the Transfer
 * log decode (token discovery), the token-row → Holding mapping with its
 * defensive drops, amount formatting, and ordering.
 */

const HOLDER = "0x9cd83be15a79646a3d22b81fc8ddf7b7240a62cb";
const TOKEN_A = "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39";
const TOKEN_B = "0xa1077a294dde1b09bb078844df40758a5d0f9a27";
const OTHER = "0x1111111111111111111111111111111111111111";

/** Encode an address as a 32-byte topic. */
function topic(addr: string): string {
  return "0x" + "000000000000000000000000" + addr.slice(2).toLowerCase();
}

function transferLog(token: string, from: string, to: string) {
  return { address: token, topics: [TRANSFER_TOPIC, topic(from), topic(to)] };
}

describe("topicToAddress", () => {
  it("extracts the low 20 bytes, lowercased", () => {
    assert.equal(topicToAddress(topic(TOKEN_A)), TOKEN_A);
  });
});

describe("extractHeldTokens", () => {
  it("collects distinct emitters where the holder is sender or receiver", () => {
    const logs = [
      transferLog(TOKEN_A, OTHER, HOLDER), // inbound
      transferLog(TOKEN_B, HOLDER, OTHER), // outbound
      transferLog(TOKEN_A, HOLDER, OTHER), // dup token → deduped
    ];
    assert.deepEqual(extractHeldTokens(logs, HOLDER), [TOKEN_A, TOKEN_B]);
  });

  it("ignores transfers the holder is not a party to", () => {
    const logs = [transferLog(TOKEN_A, OTHER, OTHER)];
    assert.deepEqual(extractHeldTokens(logs, HOLDER), []);
  });

  it("ignores non-Transfer logs", () => {
    const logs = [
      { address: TOKEN_A, topics: ["0xdeadbeef", topic(OTHER), topic(HOLDER)] },
    ];
    assert.deepEqual(extractHeldTokens(logs, HOLDER), []);
  });

  it("is case-insensitive on the holder", () => {
    const logs = [transferLog(TOKEN_A, OTHER, HOLDER.toUpperCase())];
    assert.deepEqual(extractHeldTokens(logs, HOLDER), [TOKEN_A]);
  });
});

describe("mapTokenRow", () => {
  it("maps a nonzero row, formatting by decimals", () => {
    const h = mapTokenRow(
      { address: TOKEN_A, holder: HOLDER, balance: "1500000000000000000", decimals: 18, symbol: "FOO", name: "Foo" },
      HOLDER,
    );
    assert.ok(h);
    assert.equal(h!.tokenAddress, TOKEN_A);
    assert.equal(h!.balanceFormatted, "1.5");
    assert.equal(h!.symbol, "FOO");
  });

  it("drops a zero balance", () => {
    assert.equal(
      mapTokenRow({ address: TOKEN_A, holder: HOLDER, balance: "0", decimals: 18 }, HOLDER),
      null,
    );
  });

  it("drops a row whose holder doesn't match", () => {
    assert.equal(
      mapTokenRow({ address: TOKEN_A, holder: OTHER, balance: "5", decimals: 18 }, HOLDER),
      null,
    );
  });

  it("drops a row where the token address IS the holder", () => {
    assert.equal(
      mapTokenRow({ address: HOLDER, holder: HOLDER, balance: "5", decimals: 18 }, HOLDER),
      null,
    );
  });

  it("defaults decimals to 18 when absent", () => {
    const h = mapTokenRow({ address: TOKEN_A, balance: "2000000000000000000" }, HOLDER);
    assert.equal(h!.balanceFormatted, "2");
    assert.equal(h!.decimals, 18);
  });

  it("tolerates empty symbol/name (chifra often returns them blank)", () => {
    const h = mapTokenRow({ address: TOKEN_A, balance: "1", decimals: 0 }, HOLDER);
    assert.equal(h!.symbol, "");
    assert.equal(h!.name, "");
    assert.equal(h!.balanceFormatted, "1");
  });
});

describe("formatTokenAmount", () => {
  it("decimals-adjusts", () => {
    assert.equal(formatTokenAmount("1000000", 6), "1");
  });
  it("returns '0' on a non-numeric balance", () => {
    assert.equal(formatTokenAmount("not-a-number", 18), "0");
  });
});

describe("sortHoldings", () => {
  it("orders by formatted balance descending", () => {
    const mk = (addr: string, formatted: string): Holding => ({
      tokenAddress: addr,
      symbol: "",
      name: "",
      decimals: 18,
      balance: "0",
      balanceFormatted: formatted,
    });
    const sorted = sortHoldings([mk(TOKEN_A, "5"), mk(TOKEN_B, "100"), mk(OTHER, "20")]);
    assert.deepEqual(sorted.map((h) => h.balanceFormatted), ["100", "20", "5"]);
  });
});
