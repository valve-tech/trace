import { describe, it, expect } from "vitest";
import {
  truncateAddress,
  formatGas,
  formatWei,
  getFunctionSelector,
} from "../../src/components/formatters.js";

describe("truncateAddress", () => {
  it("returns 0x0 for null/empty input", () => {
    expect(truncateAddress(null)).toBe("0x0");
    expect(truncateAddress("")).toBe("0x0");
  });

  it("returns input unchanged when shorter than 12 chars", () => {
    expect(truncateAddress("0xabc")).toBe("0xabc");
  });

  it("truncates middle of long addresses", () => {
    expect(truncateAddress("0xaaaabbbbccccddddeeeeffff00001111")).toBe(
      "0xaaaa...1111",
    );
  });
});

describe("formatGas", () => {
  it("formats bigint with thousands separators (en-US default)", () => {
    // toLocaleString output depends on the test runner locale, so just check
    // that it produced something containing the digits and is not the raw
    // bigint string.
    const result = formatGas(1_234_567n);
    expect(result).toMatch(/^1[\s,.]?234[\s,.]?567$/);
  });

  it("handles 0n", () => {
    expect(formatGas(0n)).toBe("0");
  });
});

describe("formatWei", () => {
  it("returns null for 0n", () => {
    expect(formatWei(0n)).toBeNull();
  });

  it("formats whole wei as integer PLS", () => {
    expect(formatWei(2n * 10n ** 18n)).toBe("2 PLS");
  });

  it("formats fractional wei trimming trailing zeros", () => {
    // 1.5 PLS = 1_500_000_000_000_000_000n
    expect(formatWei(1_500_000_000_000_000_000n)).toBe("1.5 PLS");
  });

  it("accepts a custom symbol", () => {
    expect(formatWei(10n ** 18n, "ETH")).toBe("1 ETH");
  });

  it("formats sub-PLS amounts", () => {
    // 0.001 PLS
    expect(formatWei(10n ** 15n)).toBe("0.001 PLS");
  });
});

describe("getFunctionSelector", () => {
  it("returns first 10 chars for normal calldata", () => {
    expect(getFunctionSelector("0xa9059cbb000000000000000000000000")).toBe(
      "0xa9059cbb",
    );
  });

  it("returns (fallback) for empty calldata", () => {
    expect(getFunctionSelector("0x")).toBe("(fallback)");
  });

  it("returns (fallback) for short calldata", () => {
    expect(getFunctionSelector("0x12")).toBe("(fallback)");
  });

  it("returns (fallback) for falsy input", () => {
    expect(getFunctionSelector("" as `0x${string}`)).toBe("(fallback)");
  });
});
