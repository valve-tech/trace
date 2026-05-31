import { describe, it, expect } from "vitest";
import { concat, keccak256, pad, toHex } from "viem";
import {
  computeMappingSlot,
  computeArraySlot,
  resolveSlot,
} from "../components/StorageLayoutViewer/slots";
import type {
  StorageEntry,
  StorageType,
} from "../components/StorageLayoutViewer/types";

/**
 * Tests for the Solidity storage-slot math. Each helper is cross-checked
 * against an independently-computed reference (using viem primitives in
 * a different formulation) so the test pins down the *spec*, not just
 * what the current implementation happens to do.
 *
 * Spec: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html
 */

function entry(overrides: Partial<StorageEntry> = {}): StorageEntry {
  return {
    label: "balances",
    slot: "0",
    offset: 0,
    type: "t_mapping(t_address,t_uint256)",
    contract: "Token",
    ...overrides,
  };
}

function type(overrides: Partial<StorageType> = {}): StorageType {
  return {
    encoding: "inplace",
    label: "uint256",
    numberOfBytes: "32",
    ...overrides,
  };
}

describe("computeMappingSlot", () => {
  it("matches keccak256(key || baseSlot) for two pre-padded 32-byte inputs", () => {
    // Reference: concat the 32-byte padded key and the 32-byte padded
    // slot, then keccak. This is the literal Solidity formula expressed
    // with viem primitives in a different order than the implementation.
    const baseSlot = "0";
    const key = "0x0000000000000000000000000000000000000001";

    const expected = keccak256(
      concat([
        pad(key, { size: 32 }),
        pad(toHex(BigInt(baseSlot)), { size: 32 }),
      ]),
    );

    expect(computeMappingSlot(baseSlot, key)).toBe(expected);
  });

  it("places the key BEFORE the slot in the preimage (order matters!)", () => {
    // Solidity is `keccak256(abi.encode(key, slot))` — key first. If the
    // implementation accidentally swaps them, this test catches it.
    const baseSlot = "5";
    const key = ("0x" + "11".repeat(20)) as `0x${string}`;

    const correct = keccak256(
      concat([pad(key, { size: 32 }), pad(toHex(BigInt(baseSlot)), { size: 32 })]),
    );
    const swapped = keccak256(
      concat([pad(toHex(BigInt(baseSlot)), { size: 32 }), pad(key, { size: 32 })]),
    );

    expect(computeMappingSlot(baseSlot, key)).toBe(correct);
    expect(computeMappingSlot(baseSlot, key)).not.toBe(swapped);
  });

  it("produces distinct slots for distinct keys at the same base slot", () => {
    const a = computeMappingSlot("0", "0x" + "00".repeat(31) + "01");
    const b = computeMappingSlot("0", "0x" + "00".repeat(31) + "02");
    expect(a).not.toBe(b);
  });

  it("produces distinct slots for the same key at different base slots", () => {
    const key = "0x" + "ab".repeat(20);
    expect(computeMappingSlot("0", key)).not.toBe(computeMappingSlot("1", key));
  });

  it("returns a 32-byte (66-char) 0x-prefixed hex string", () => {
    const out = computeMappingSlot("3", "0x" + "11".repeat(20));
    expect(out).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is deterministic — same inputs produce same output", () => {
    const inputs = ["7", "0xdeadbeef"] as const;
    expect(computeMappingSlot(...inputs)).toBe(computeMappingSlot(...inputs));
  });

  it("handles a base slot beyond Number.MAX_SAFE_INTEGER", () => {
    // Decimal string for 2^60, larger than MAX_SAFE_INTEGER (~2^53)
    const bigSlot = (1n << 60n).toString();
    expect(() =>
      computeMappingSlot(bigSlot, "0x" + "00".repeat(32)),
    ).not.toThrow();
  });
});

describe("computeArraySlot", () => {
  it("element 0 of a 32-byte-element array lives at keccak256(baseSlot-padded)", () => {
    const baseSlot = "3";
    const expected = keccak256(pad(toHex(BigInt(baseSlot)), { size: 32 }));
    expect(computeArraySlot(baseSlot, 0, 32)).toBe(expected);
  });

  it("element N of a 32-byte array is keccak256(slot) + N (one slot per element)", () => {
    const baseSlot = "0";
    const base = BigInt(
      keccak256(pad(toHex(BigInt(baseSlot)), { size: 32 })),
    );
    for (const i of [1, 5, 100]) {
      expect(computeArraySlot(baseSlot, i, 32)).toBe(toHex(base + BigInt(i)));
    }
  });

  it("element N of a struct array uses ceil(size/32) slots per element", () => {
    // 96-byte struct → 3 slots per element. Element 2 should be base + 6.
    const baseSlot = "0";
    const base = BigInt(
      keccak256(pad(toHex(BigInt(baseSlot)), { size: 32 })),
    );
    expect(computeArraySlot(baseSlot, 2, 96)).toBe(toHex(base + 6n));
  });

  it("rounds up partial-slot element sizes (33 bytes → 2 slots/elem)", () => {
    // Defensive: solc shouldn't emit non-32-multiple sizes for elements,
    // but if it ever does, ceil() should round up rather than truncate.
    const baseSlot = "0";
    const base = BigInt(
      keccak256(pad(toHex(BigInt(baseSlot)), { size: 32 })),
    );
    expect(computeArraySlot(baseSlot, 1, 33)).toBe(toHex(base + 2n));
  });

  it("returns a 0x-prefixed hex string (may not be 32 bytes after addition)", () => {
    // toHex(BigInt + N) doesn't repad to 32 bytes — the caller passes it
    // straight into eth_getStorageAt, which accepts unpadded hex.
    const out = computeArraySlot("0", 0, 32);
    expect(out.startsWith("0x")).toBe(true);
  });
});

describe("resolveSlot", () => {
  it("returns null when typeInfo is missing (unknown solc type tag)", () => {
    expect(resolveSlot(entry(), undefined, "anything")).toBeNull();
  });

  it("mapping: returns null when rawKey is empty (no slot to read yet)", () => {
    const t = type({ encoding: "mapping" });
    expect(resolveSlot(entry(), t, "")).toBeNull();
  });

  it("mapping: passes a 0x-prefixed key through unchanged into computeMappingSlot", () => {
    const t = type({ encoding: "mapping" });
    const e = entry({ slot: "0" });
    const key = "0x" + "00".repeat(19) + "01"; // 20-byte address
    // Sanity: matches what computeMappingSlot would produce directly
    expect(resolveSlot(e, t, key)).toBe(computeMappingSlot("0", key));
  });

  it("mapping: converts a decimal-uint key via BigInt → padded hex", () => {
    const t = type({ encoding: "mapping" });
    const e = entry({ slot: "0" });
    const expected = computeMappingSlot(
      "0",
      pad(toHex(BigInt("42")), { size: 32 }),
    );
    expect(resolveSlot(e, t, "42")).toBe(expected);
  });

  it("dynamic_array: returns null when rawKey is not a parseable int", () => {
    const t = type({ encoding: "dynamic_array", numberOfBytes: "32" });
    expect(resolveSlot(entry(), t, "")).toBeNull();
    expect(resolveSlot(entry(), t, "not-a-number")).toBeNull();
  });

  it("dynamic_array: parses index and uses type.numberOfBytes as element size", () => {
    const t = type({ encoding: "dynamic_array", numberOfBytes: "96" });
    const e = entry({ slot: "0" });
    // element 3 of a 96-byte-element array
    expect(resolveSlot(e, t, "3")).toBe(computeArraySlot("0", 3, 96));
  });

  it("simple variable (inplace): returns base slot padded to 32 bytes", () => {
    const t = type({ encoding: "inplace" });
    const e = entry({ slot: "7" });
    expect(resolveSlot(e, t, "")).toBe(pad(toHex(7n), { size: 32 }));
  });

  it("simple variable: ignores the rawKey entirely (no key to apply)", () => {
    const t = type({ encoding: "inplace" });
    const e = entry({ slot: "7" });
    expect(resolveSlot(e, t, "garbage-input")).toBe(
      pad(toHex(7n), { size: 32 }),
    );
  });

  it("unknown encoding (e.g. 'bytes'): falls through to simple-variable path", () => {
    // The viewer treats anything that isn't mapping/dynamic_array as a
    // simple base-slot read. `bytes` storage is technically more
    // complex (short vs long encoding), but the viewer only displays
    // the head slot — which is the base slot.
    const t = type({ encoding: "bytes" });
    const e = entry({ slot: "2" });
    expect(resolveSlot(e, t, "")).toBe(pad(toHex(2n), { size: 32 }));
  });
});
