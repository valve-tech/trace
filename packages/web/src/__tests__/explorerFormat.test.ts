import { describe, it, expect } from "vitest";
import {
  formatPLS,
  groupDecimalString,
  subscriptSmallString,
  isZeroDecimal,
} from "../components/explorer/format";

/**
 * The explorer value formatters operate on EXACT decimal strings (formatEther
 * results) with pure string ops — no parseFloat — so large balances stay exact.
 */

describe("explorer/format — groupDecimalString", () => {
  it("groups the integer part and caps/strips the fraction", () => {
    expect(groupDecimalString("1234567.891234", 6)).toBe("1,234,567.891234");
    expect(groupDecimalString("1234567.891234", 2)).toBe("1,234,567.89");
    expect(groupDecimalString("1000.5000", 6)).toBe("1,000.5");
    expect(groupDecimalString("0", 6)).toBe("0");
  });

  it("stays exact for a value far past 2^53", () => {
    // 9,007,199,254,740,993 (2^53 + 1) — parseFloat would collapse it.
    expect(groupDecimalString("9007199254740993", 0)).toBe(
      "9,007,199,254,740,993",
    );
  });
});

describe("explorer/format — subscriptSmallString", () => {
  it("uses subscript notation for 3+ leading zeros", () => {
    expect(subscriptSmallString("0.00000000123")).toBe("0.0₈123");
    expect(subscriptSmallString("0.0001")).toBe("0.0₃1");
  });

  it("returns null for >= 1 or too-few leading zeros", () => {
    expect(subscriptSmallString("1.5")).toBeNull();
    expect(subscriptSmallString("0.01")).toBeNull(); // only 1 leading zero
  });
});

describe("explorer/format — formatPLS", () => {
  it("groups large values and strips trailing zeros", () => {
    expect(formatPLS("1234567.5")).toBe("1,234,567.5 PLS");
    expect(formatPLS("0")).toBe("0 PLS");
    expect(formatPLS("0.000000000000000000")).toBe("0 PLS");
  });

  it("uses subscript notation for dust", () => {
    expect(formatPLS("0.00000000123")).toBe("0.0₈123 PLS");
  });

  it("stays exact for a balance past 2^53", () => {
    expect(formatPLS("9007199254740993.5")).toBe("9,007,199,254,740,993.5 PLS");
  });
});

describe("explorer/format — isZeroDecimal", () => {
  it("recognizes zero in its various string forms", () => {
    expect(isZeroDecimal("0")).toBe(true);
    expect(isZeroDecimal("0.000")).toBe(true);
    expect(isZeroDecimal("-0")).toBe(true);
    expect(isZeroDecimal("0.0001")).toBe(false);
    expect(isZeroDecimal("1")).toBe(false);
  });
});
