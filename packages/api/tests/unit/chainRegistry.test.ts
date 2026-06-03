import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CHAIN_ID,
  getChain,
  isSupportedChain,
  listChains,
} from "../../src/services/chains/registry.js";

/** An id that is deliberately NOT in the launch set (Base mainnet). */
const UNREGISTERED_CHAIN_ID = 8453;

/**
 * Unit tests for the per-chain ChainConfig registry. Pure data + three
 * lookups — no daemon, no network. Pins the launch set (1/369/943), the
 * chifra slugs (the load-bearing field for portfolio holdings), and the
 * throw-vs-guard contract on unknown ids.
 */

describe("chain registry — launch set", () => {
  it("registers exactly chains 1, 369, 943", () => {
    const ids = listChains().map((c) => c.chainId);
    assert.deepEqual(ids, [1, 369, 943]);
  });

  it("defaults to PulseChain (369)", () => {
    assert.equal(DEFAULT_CHAIN_ID, 369);
    assert.equal(isSupportedChain(DEFAULT_CHAIN_ID), true);
  });

  it("carries the chifra daemon slugs verified against status?chains=true", () => {
    assert.equal(getChain(1).chifraChain, "mainnet");
    assert.equal(getChain(369).chifraChain, "pulsechain");
    assert.equal(getChain(943).chifraChain, "pulsechain-v4");
  });

  it("uses the daemon/viem native symbols (943 is v4PLS, not tPLS)", () => {
    assert.equal(getChain(1).nativeSymbol, "ETH");
    assert.equal(getChain(369).nativeSymbol, "PLS");
    assert.equal(getChain(943).nativeSymbol, "v4PLS");
  });

  it("binds each entry to the matching viem chain definition", () => {
    for (const c of listChains()) {
      assert.equal(c.viemChain.id, c.chainId, `viemChain.id mismatch for ${c.chainId}`);
    }
  });

  it("only PulseChain mainnet ships a blockscoutBase; others omit it", () => {
    assert.ok(getChain(369).blockscoutBase, "369 should have a blockscout base");
    assert.equal(getChain(1).blockscoutBase, undefined);
    assert.equal(getChain(943).blockscoutBase, undefined);
  });

  it("carries the substreams endpoint per the evm-{id}-substreams.valve.city pattern", () => {
    for (const c of listChains()) {
      assert.equal(c.substreamsEndpoint, `evm-${c.chainId}-substreams.valve.city`);
    }
  });

  it("flags the testnet", () => {
    assert.equal(getChain(1).testnet, false);
    assert.equal(getChain(369).testnet, false);
    assert.equal(getChain(943).testnet, true);
  });
});

describe("chain registry — lookup contract", () => {
  it("isSupportedChain is false for unknown ids", () => {
    assert.equal(isSupportedChain(UNREGISTERED_CHAIN_ID), false);
    assert.equal(isSupportedChain(0), false);
  });

  it("getChain throws on an unregistered id (callers must gate first)", () => {
    assert.throws(
      () => getChain(UNREGISTERED_CHAIN_ID),
      /Unsupported chainId: 8453/,
    );
  });
});
