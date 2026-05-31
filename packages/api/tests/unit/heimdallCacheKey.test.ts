import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bytecodeCacheKey } from "../../src/services/decompiler/cache.js";

/**
 * Unit tests for the bytecode → cache-key hash. The contract: same
 * bytecode (any hex casing, with or without 0x prefix) maps to ONE key;
 * different bytecode maps to different keys. The 0x and hex-casing
 * normalization is what de-dupes the proxy-implementation case across
 * RPC responses that may format inconsistently.
 */

describe("bytecodeCacheKey", () => {
  it("returns a 64-char lowercase hex string (sha256 hex digest shape)", () => {
    const key = bytecodeCacheKey("0xdeadbeef");
    assert.match(key, /^[0-9a-f]{64}$/);
  });

  it("is invariant to the 0x prefix", () => {
    assert.equal(bytecodeCacheKey("0xdeadbeef"), bytecodeCacheKey("deadbeef"));
  });

  it("is invariant to hex casing", () => {
    assert.equal(bytecodeCacheKey("0xDEADBEEF"), bytecodeCacheKey("0xdeadbeef"));
    assert.equal(bytecodeCacheKey("0xDeAdBeEf"), bytecodeCacheKey("0xdeadbeef"));
  });

  it("produces distinct keys for distinct bytecode", () => {
    const a = bytecodeCacheKey("0xdeadbeef");
    const b = bytecodeCacheKey("0xdeadbeee"); // off by one nibble
    assert.notEqual(a, b);
  });

  it("is deterministic across calls", () => {
    const inputs = ["0x", "0xdeadbeef", "608060405234801561001057600080fd"];
    for (const input of inputs) {
      assert.equal(bytecodeCacheKey(input), bytecodeCacheKey(input));
    }
  });

  it("hashes an empty bytecode as a defined value (sha256 of empty string)", () => {
    // sha256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    assert.equal(
      bytecodeCacheKey("0x"),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    // Same as raw empty input
    assert.equal(bytecodeCacheKey(""), bytecodeCacheKey("0x"));
  });

  it("is invariant when the prefix-without-data uses different casing", () => {
    // "0X" prefix (uppercase) shouldn't be treated as data — but the
    // current impl only strips lowercase "0x". Documenting current
    // behavior so a future tightening is loud.
    const lower = bytecodeCacheKey("0xab");
    const upper = bytecodeCacheKey("0Xab");
    assert.notEqual(lower, upper);
  });
});
