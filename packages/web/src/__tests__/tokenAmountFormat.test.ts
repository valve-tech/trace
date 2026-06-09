import { describe, it, expect } from "vitest";
import {
  formatTokenAmount,
  formatAmountDisplay,
  formatGwei,
  parseAmountToBase,
} from "../lib/format/tokenAmount";

describe("format/tokenAmount — formatAmountDisplay", () => {
  it("groups the integer part and caps fraction digits", () => {
    // 1,234,567.891234 WPLS at 18 decimals, capped to 4 fraction digits.
    const raw = 1234567891234000000000000n;
    expect(
      formatAmountDisplay(raw, 18, { maxFractionDigits: 4, symbol: "WPLS" }),
    ).toBe("1,234,567.8912 WPLS");
  });

  it("rounds (base-10, half-up) when capping fraction digits", () => {
    // 1.23456 → 3dp → 1.235
    expect(formatAmountDisplay(1234560000n, 9, { maxFractionDigits: 3 })).toBe(
      "1.235",
    );
    // carry propagates into the integer part: 0.9996 → 3dp → 1
    expect(formatAmountDisplay(9996n, 4, { maxFractionDigits: 3 })).toBe("1");
    // round-up that grows the integer width: 9.96 → 1dp → 10
    expect(formatAmountDisplay(996n, 2, { maxFractionDigits: 1 })).toBe("10");
  });

  it("stays EXACT past 2^53 — no Number() rounding", () => {
    // 9,007,199,254,740,993 (2^53 + 1) whole tokens at 18 decimals. Number()
    // would collapse the trailing digits; bigint+formatUnits keeps them.
    const raw = 9007199254740993n * 10n ** 18n;
    expect(formatAmountDisplay(raw, 18)).toBe("9,007,199,254,740,993");
  });

  it("strips trailing zeros and a bare decimal point", () => {
    expect(formatAmountDisplay(1_500_000n, 6)).toBe("1.5");
    expect(formatAmountDisplay(1_000_000n, 6)).toBe("1");
  });

  it("shows raw grouped integer when decimals are unknown", () => {
    expect(formatAmountDisplay("1500000", null)).toBe("1,500,000");
  });

  it("can disable grouping", () => {
    expect(formatAmountDisplay(1234567n, 0, { group: false })).toBe("1234567");
  });

  it("handles sub-1 amounts without dropping leading zero", () => {
    expect(formatAmountDisplay(50_000n, 6)).toBe("0.05");
  });

  it("formatTokenAmount stays exact (no cap) for the precise column", () => {
    expect(formatTokenAmount(1234567891234000000000000n, 18)).toBe(
      "1234567.891234",
    );
  });
});

describe("format/tokenAmount — formatGwei", () => {
  it("scales wei→gwei exactly with grouping", () => {
    expect(formatGwei("1000000000")).toBe("1");
    expect(formatGwei("1500000000")).toBe("1.5");
    expect(formatGwei("1234560000", 3)).toBe("1.235"); // rounds
    expect(formatGwei("12345000000000")).toBe("12,345");
  });

  it("formats huge values exactly (no Number overflow) and guards garbage", () => {
    expect(formatGwei("1" + "0".repeat(40))).toBe(
      "10,000,000,000,000,000,000,000,000,000,000",
    );
    expect(formatGwei(null)).toBeNull();
    expect(formatGwei("nope")).toBeNull();
  });
});

describe("format/tokenAmount — parseAmountToBase", () => {
  it("parses a human decimal to base units exactly (no float)", () => {
    expect(parseAmountToBase("1.5", 18)).toBe(1500000000000000000n);
    // 18 fractional digits — float (Math.floor(x*1e18)) would round this off.
    expect(parseAmountToBase("0.000000000000000001", 18)).toBe(1n);
    expect(parseAmountToBase("1000000", 6)).toBe(1000000000000n);
  });

  it("returns null for blank or malformed input", () => {
    expect(parseAmountToBase("", 18)).toBeNull();
    expect(parseAmountToBase("   ", 18)).toBeNull();
    expect(parseAmountToBase("abc", 18)).toBeNull();
  });
});
