import { describe, it, expect } from "vitest";
import { plsToWei } from "../components/TransactionBuilder/value";

/**
 * Unit tests for the PLS-string → wei-hex conversion. The function uses
 * parseFloat, so we explicitly pin down which inputs produce exact wei
 * and which round — a future migration to viem's parseEther would only
 * change the rounding behavior, not the null-out-of-band behavior.
 */

describe("plsToWei", () => {
  it("returns null for an empty string", () => {
    expect(plsToWei("")).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(plsToWei("   ")).toBeNull();
  });

  it("returns null for zero (treated as 'don't send value')", () => {
    expect(plsToWei("0")).toBeNull();
    expect(plsToWei("0.0")).toBeNull();
  });

  it("returns null for a negative value", () => {
    expect(plsToWei("-1")).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(plsToWei("abc")).toBeNull();
  });

  it("converts '1' PLS to 0xde0b6b3a7640000 (1e18 wei)", () => {
    // 1e18 = 0xde0b6b3a7640000
    expect(plsToWei("1")).toBe("0xde0b6b3a7640000");
  });

  it("converts '0.5' PLS to 5e17 wei", () => {
    const wei = BigInt(plsToWei("0.5")!);
    expect(wei).toBe(5n * 10n ** 17n);
  });

  it("strips surrounding whitespace before parsing", () => {
    expect(plsToWei("  1  ")).toBe(plsToWei("1"));
  });

  it("known precision limit: 18-fractional-digit input rounds via parseFloat", () => {
    // "1.234567890123456789" has 19 sig figs; JS Number rounds to ~15,
    // so the output is NOT exactly 1234567890123456789n wei. This is
    // the documented limitation of routing through parseFloat — a
    // future viem.parseEther swap would fix it. The test pins down the
    // current behavior so we'd notice if the rounding bucket shifts.
    const out = BigInt(plsToWei("1.234567890123456789")!);
    // The float 1.234567890123456789 is the same as 1.2345678901234568,
    // so the result is floor(1.2345678901234568 * 1e18).
    const expected = BigInt(Math.floor(1.234567890123456789 * 1e18));
    expect(out).toBe(expected);
  });

  it("returns a lowercase 0x-prefixed hex (BigInt.toString(16) defaults)", () => {
    expect(plsToWei("1")).toMatch(/^0x[0-9a-f]+$/);
  });

  it("rejects 'NaN' and 'Infinity' literals", () => {
    expect(plsToWei("NaN")).toBeNull();
    expect(plsToWei("Infinity")).toBeNull();
  });
});
