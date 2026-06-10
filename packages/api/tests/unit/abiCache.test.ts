import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Abi } from "viem";
import {
  _getAbiCacheSize,
  invalidateAbiCache,
  readCachedAbi,
  writeCachedAbi,
} from "../../src/services/decoder/abiCache.js";

/**
 * Unit tests for the in-memory ABI cache. Three load-bearing
 * behaviors: TTL expiry, FIFO eviction at capacity, and
 * invalidate-by-key / invalidate-all. The cache is a Map so each test
 * resets it via `invalidateAbiCache()` before exercising.
 */

const SAMPLE_ABI: Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

const ANOTHER_ABI: Abi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
];

beforeEach(() => {
  invalidateAbiCache();
});

describe("readCachedAbi", () => {
  it("returns null on a cold cache", () => {
    assert.equal(readCachedAbi("0xabc"), null);
  });

  it("returns the ABI written under the same key", () => {
    writeCachedAbi("0xabc", SAMPLE_ABI);
    assert.deepEqual(readCachedAbi("0xabc"), SAMPLE_ABI);
  });

  it("misses for a different key", () => {
    writeCachedAbi("0xabc", SAMPLE_ABI);
    assert.equal(readCachedAbi("0xdef"), null);
  });

  it("expires entries past the TTL and removes them from the map", () => {
    writeCachedAbi("0xabc", SAMPLE_ABI);
    // Sneak the timestamp into the past by overwriting via a fresh
    // write. The cache exposes no clock-override, so we fake "old" by
    // shifting Date.now via globalThis temporarily.
    const realNow = Date.now;
    const past = Date.now() - 2 * 60 * 60 * 1000; // 2h ago, past 1h TTL
    Date.now = () => past;
    writeCachedAbi("0xabc", SAMPLE_ABI);
    Date.now = realNow;
    // Now a read happens at "real" Date.now, which is 2h after insert.
    assert.equal(readCachedAbi("0xabc"), null);
    // Size dropped to 0 because the expired read also evicts.
    assert.equal(_getAbiCacheSize(), 0);
  });
});

describe("writeCachedAbi", () => {
  it("upserts on repeat writes to the same key", () => {
    writeCachedAbi("0xabc", SAMPLE_ABI);
    writeCachedAbi("0xabc", ANOTHER_ABI);
    assert.deepEqual(readCachedAbi("0xabc"), ANOTHER_ABI);
    assert.equal(_getAbiCacheSize(), 1);
  });

  it("grows the cache up to its capacity", () => {
    for (let i = 0; i < 100; i++) writeCachedAbi(`0x${i}`, SAMPLE_ABI);
    assert.equal(_getAbiCacheSize(), 100);
  });

  it("evicts the oldest entry once it crosses the 500-entry cap (FIFO)", () => {
    // Write 501 entries — the first should be evicted, the rest stay.
    for (let i = 0; i < 501; i++) writeCachedAbi(`addr-${i}`, SAMPLE_ABI);
    assert.equal(_getAbiCacheSize(), 500);
    assert.equal(readCachedAbi("addr-0"), null); // oldest evicted
    assert.deepEqual(readCachedAbi("addr-500"), SAMPLE_ABI);
  });
});

describe("invalidateAbiCache", () => {
  it("drops an address across every chain (case-insensitive)", () => {
    // Keys are `<chainId>:<address>` — invalidating by address clears the
    // address on all chains while leaving sibling addresses untouched.
    writeCachedAbi("369:0xabc", SAMPLE_ABI);
    writeCachedAbi("1:0xabc", SAMPLE_ABI);
    writeCachedAbi("369:0xdef", ANOTHER_ABI);
    invalidateAbiCache("0xABC"); // upper-case input
    assert.equal(readCachedAbi("369:0xabc"), null);
    assert.equal(readCachedAbi("1:0xabc"), null);
    // Sibling key untouched
    assert.deepEqual(readCachedAbi("369:0xdef"), ANOTHER_ABI);
  });

  it("clears the entire cache when called with no argument", () => {
    writeCachedAbi("0xabc", SAMPLE_ABI);
    writeCachedAbi("0xdef", ANOTHER_ABI);
    invalidateAbiCache();
    assert.equal(_getAbiCacheSize(), 0);
    assert.equal(readCachedAbi("0xabc"), null);
    assert.equal(readCachedAbi("0xdef"), null);
  });

  it("invalidating a missing address is a silent no-op", () => {
    writeCachedAbi("0xabc", SAMPLE_ABI);
    invalidateAbiCache("0xnotpresent");
    // Existing entry untouched
    assert.equal(_getAbiCacheSize(), 1);
    assert.deepEqual(readCachedAbi("0xabc"), SAMPLE_ABI);
  });
});
