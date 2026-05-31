import { describe, it, expect } from "vitest";
import {
  truncateHex,
  formatPlsValue,
  isDeltaPositive,
  formatDecodedShort,
} from "../components/StateDiffPanel/formatters";
import type { DecodedRow } from "../lib/storageDecode";

/**
 * Unit tests for the pure formatters extracted from StateDiffPanel. Each
 * function is short but used across many cells in the panel, so an
 * off-by-one in truncation or a bad zero-check shows up in dozens of
 * places at once.
 */

describe("truncateHex", () => {
  it("returns the input unchanged when shorter than prefix + suffix + 2", () => {
    // default prefix=6, suffix=4 → threshold is 12 chars total
    expect(truncateHex("0x1234")).toBe("0x1234");
    expect(truncateHex("0xabcdef1234")).toBe("0xabcdef1234"); // 12 chars
  });

  it("truncates with default 6+4 split when input is long", () => {
    expect(truncateHex("0x1234567890abcdef")).toBe("0x1234...cdef");
  });

  it("honors a custom prefix length", () => {
    expect(truncateHex("0x1234567890abcdef", 10)).toBe("0x12345678...cdef");
  });

  it("honors a custom suffix length", () => {
    expect(truncateHex("0x1234567890abcdef", 6, 8)).toBe("0x1234...90abcdef");
  });

  it("notable JS quirk: slice(-0) === slice(0), so suffix=0 echoes the whole string", () => {
    // Documenting the surprising behavior — `String.prototype.slice(-0)` is
    // equivalent to `slice(0)`, returning the entire string. Callers should
    // pass suffix >= 1 to actually get a trailing slice. The formatter
    // doesn't special-case this because it's never called with suffix=0 in
    // production.
    expect(truncateHex("0x1234567890abcdef", 4, 0)).toBe(
      "0x12...0x1234567890abcdef",
    );
  });

  it("works on non-hex strings too (the formatter doesn't validate hex)", () => {
    expect(truncateHex("very long contract name with extra")).toBe(
      "very l...xtra",
    );
  });
});

describe("formatPlsValue", () => {
  it("formats one PLS (1e18 wei) as '1'", () => {
    expect(formatPlsValue("1000000000000000000")).toBe("1");
  });

  it("strips trailing zeros in fractional values", () => {
    expect(formatPlsValue("1500000000000000000")).toBe("1.5");
  });

  it("returns '0' exactly for a zero input", () => {
    expect(formatPlsValue("0")).toBe("0");
  });

  it("rounds to 6 significant decimals max", () => {
    // 1.23456789012... PLS in wei
    expect(formatPlsValue("1234567890123456789")).toBe("1.234568");
  });

  it("handles a value larger than Number.MAX_SAFE_INTEGER via BigInt", () => {
    // 1e25 wei = 10,000,000 PLS
    const tenMillionPls = "10000000000000000000000000";
    expect(formatPlsValue(tenMillionPls)).toBe("10,000,000");
  });

  it("returns the raw input on a malformed wei string (defensive fallback)", () => {
    expect(formatPlsValue("not-a-number")).toBe("not-a-number");
  });
});

describe("isDeltaPositive", () => {
  it("returns true for a positive integer string", () => {
    expect(isDeltaPositive("100")).toBe(true);
  });

  it("returns false for a negative-prefixed string (no BigInt parse)", () => {
    expect(isDeltaPositive("-100")).toBe(false);
  });

  it("returns false for exact zero", () => {
    expect(isDeltaPositive("0")).toBe(false);
  });

  it("returns true for a very large positive value (beyond Number range)", () => {
    expect(isDeltaPositive("999999999999999999999999999999")).toBe(true);
  });

  it("returns false for negative-zero ('-0')", () => {
    // "-0".startsWith("-") → returns false before any BigInt parse.
    expect(isDeltaPositive("-0")).toBe(false);
  });
});

describe("formatDecodedShort", () => {
  it("returns null for an 'unsupported' kind (the SDK helper returns null)", () => {
    const v: DecodedRow["before"] = {
      kind: "unsupported",
      reason: "mapping",
    };
    expect(formatDecodedShort(v)).toBeNull();
  });

  it("truncates an address-kind value to 8-char prefix + 6-char suffix", () => {
    const v: DecodedRow["before"] = {
      kind: "address",
      address: "0xEFd2aB7E09f436E8d29BB04Df76a9Dec77E5F0a3",
    };
    const out = formatDecodedShort(v);
    // truncateHex(_, 8, 6) → first 8 chars + "..." + last 6 chars
    expect(out).toBe("0xEFd2aB...E5F0a3");
  });

  it("truncates a bytes-kind value the same way as an address", () => {
    const v: DecodedRow["before"] = {
      kind: "bytes",
      hex: "0x1111222233334444555566667777888899990000aaaa",
      size: 22,
    };
    const out = formatDecodedShort(v);
    expect(out).toMatch(/\.\.\./);
  });

  it("does NOT truncate a uint-kind value, but DOES locale-format the number", () => {
    // formatDecodedValue uses toLocaleString for numbers, which adds the
    // default locale's grouping separators (comma in en-US).
    const v: DecodedRow["before"] = { kind: "uint", value: 12345n, bits: 256 };
    expect(formatDecodedShort(v)).toBe("12,345");
  });

  it("does NOT truncate a bool-kind value", () => {
    const v: DecodedRow["before"] = { kind: "bool", value: true };
    expect(formatDecodedShort(v)).toBe("true");
  });

  it("formats an int-kind value (signed integer)", () => {
    const v: DecodedRow["before"] = { kind: "int", value: -42n, bits: 256 };
    expect(formatDecodedShort(v)).toBe("-42");
  });
});
