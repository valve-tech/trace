import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractStorageSlots } from "../../src/services/decompiler/parseDecompiled.js";
import {
  KNOWN_SLOTS,
  lookupKnownSlot,
} from "../../src/services/decompiler/knownSlots.js";

/**
 * Unit tests for the storage-slot extractor. Heimdall renders storage
 * accesses INLINE in its decompiled output as `storage[<hex>]`; the
 * extractor regex-scans those references, classifies read vs write by
 * looking at what follows the closing bracket, and cross-references
 * against the well-known proxy-slot registry.
 *
 * Tests use small synthetic .sol snippets so the extractor's behavior
 * is pinned regardless of heimdall's exact output formatting (which
 * has drifted across versions).
 */

describe("extractStorageSlots — basic", () => {
  it("returns [] for empty input", () => {
    assert.deepEqual(extractStorageSlots(""), []);
  });

  it("returns [] when the source has no storage references", () => {
    const src = `function foo() public {\n  uint x = 1;\n}`;
    assert.deepEqual(extractStorageSlots(src), []);
  });

  it("extracts a single storage read", () => {
    const src = `return storage[0x05];`;
    const out = extractStorageSlots(src);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0]!.access, ["read"]);
    assert.equal(out[0]!.hitCount, 1);
  });

  it("normalizes slot to 0x-prefixed, lowercase, zero-padded to 64 chars", () => {
    const src = `return storage[0xAB];`;
    const out = extractStorageSlots(src);
    assert.equal(
      out[0]!.slot,
      "0x00000000000000000000000000000000000000000000000000000000000000ab",
    );
  });

  it("classifies a write when `=` follows the closing bracket", () => {
    const src = `storage[0x01] = msg.sender;`;
    const out = extractStorageSlots(src);
    assert.deepEqual(out[0]!.access, ["write"]);
  });

  it("treats `==` as a read (comparison, not assignment)", () => {
    const src = `if (storage[0x01] == 0x0) revert();`;
    const out = extractStorageSlots(src);
    assert.deepEqual(out[0]!.access, ["read"]);
  });

  it("treats whitespace before `=` as a write", () => {
    const src = `storage[0x01]   = 42;`;
    const out = extractStorageSlots(src);
    assert.deepEqual(out[0]!.access, ["write"]);
  });

  it("merges reads + writes on the same slot into one entry with both", () => {
    const src = `
      uint prev = storage[0x01];
      storage[0x01] = prev + 1;
    `;
    const out = extractStorageSlots(src);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0]!.access.sort(), ["read", "write"]);
    assert.equal(out[0]!.hitCount, 2);
  });
});

describe("extractStorageSlots — known proxy slots", () => {
  it("labels the EIP-1967 implementation slot when it appears", () => {
    const src = `address impl = address(uint160(storage[0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc]));`;
    const out = extractStorageSlots(src);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.known?.label, "EIP-1967 implementation");
  });

  it("labels every documented known slot when present", () => {
    // Synthesize a source that touches every known slot — guards
    // against a typo in knownSlots.ts that drops a label.
    const src = KNOWN_SLOTS
      .map((k) => `return storage[0x${k.slot}];`)
      .join("\n");
    const out = extractStorageSlots(src);
    assert.equal(out.length, KNOWN_SLOTS.length);
    for (const row of out) assert.notEqual(row.known, null);
  });

  it("sorts known slots first, then unknowns by hex order", () => {
    // Mix one EIP-1967 slot in with two unknowns; expect the EIP-1967
    // entry first, then the unknowns sorted by hex.
    const src = `
      storage[0x02] = 0;
      storage[0x01] = 0;
      storage[0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc] = 0;
    `;
    const out = extractStorageSlots(src);
    assert.equal(out[0]!.known?.label, "EIP-1967 implementation");
    assert.equal(out[1]!.slot.slice(-2), "01");
    assert.equal(out[2]!.slot.slice(-2), "02");
  });
});

describe("lookupKnownSlot", () => {
  it("returns null for an unknown slot", () => {
    assert.equal(lookupKnownSlot("0xdead"), null);
  });

  it("matches a known slot regardless of 0x prefix presence", () => {
    const slot = "360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    assert.equal(lookupKnownSlot(slot)?.label, "EIP-1967 implementation");
    assert.equal(lookupKnownSlot(`0x${slot}`)?.label, "EIP-1967 implementation");
  });

  it("matches a known slot regardless of hex casing", () => {
    const slot = "360894A13BA1A3210667C828492DB98DCA3E2076CC3735A920A3CA505D382BBC";
    assert.equal(lookupKnownSlot(slot)?.label, "EIP-1967 implementation");
  });

  it("zero-pads a short slot when looking up (defensive)", () => {
    // The registry is keyed on 64-char hex. A short slot like "0x5"
    // shouldn't match anything in the registry, but the pad-then-lookup
    // shouldn't throw either.
    assert.equal(lookupKnownSlot("0x5"), null);
  });
});
