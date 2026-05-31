import { describe, it, expect } from "vitest";
import {
  bigintOf,
  gweiDisp,
} from "../components/mempool/MempoolView/formatters";

/**
 * Unit tests for the pure wei/gwei helpers extracted from MempoolView. Both
 * are defensive against null + malformed input from the JSON-RPC node — if
 * those defenses regress, the sort comparator throws or the gas cell shows
 * "0 gwei" for missing fields. Worth pinning down explicitly.
 */

describe("bigintOf", () => {
  it("returns 0n for null (the missing-fee-field case)", () => {
    expect(bigintOf(null)).toBe(0n);
  });

  it("parses a positive decimal string as a BigInt", () => {
    expect(bigintOf("12345")).toBe(12345n);
  });

  it("handles values well beyond Number.MAX_SAFE_INTEGER", () => {
    // 1e21 wei = 1000 PLS
    expect(bigintOf("1000000000000000000000")).toBe(10n ** 21n);
  });

  it("returns 0n for a non-numeric string (defensive fallback)", () => {
    expect(bigintOf("not-a-number")).toBe(0n);
  });

  it("returns 0n for the empty string (BigInt('') throws)", () => {
    expect(bigintOf("")).toBe(0n);
  });

  it("parses a 0x-prefixed hex string (BigInt understands hex literals)", () => {
    // Documenting the quirk — the RPC sends decimal strings in practice,
    // but BigInt() also accepts "0x..." form, so the formatter doesn't
    // reject it.
    expect(bigintOf("0xff")).toBe(255n);
  });
});

describe("gweiDisp", () => {
  it("returns null for null input (so the cell can render an em-dash)", () => {
    expect(gweiDisp(null)).toBeNull();
  });

  it("formats 1 gwei (1e9 wei) as '1'", () => {
    expect(gweiDisp("1000000000")).toBe("1");
  });

  it("formats fractional gwei with up to 3 decimals", () => {
    // 1.5 gwei in wei
    expect(gweiDisp("1500000000")).toBe("1.5");
  });

  it("rounds beyond 3 fractional digits (4th digit drops)", () => {
    // 1.23456 gwei → "1.235" (toLocaleString rounds, not truncates)
    expect(gweiDisp("1234560000")).toBe("1.235");
  });

  it("adds locale grouping separators for large gwei values", () => {
    // 12,345 gwei (a chunky priority tip on a hot day)
    expect(gweiDisp("12345000000000")).toBe("12,345");
  });

  it("returns null for a non-numeric string (defensive)", () => {
    expect(gweiDisp("nope")).toBeNull();
  });

  it("returns null when the gwei value overflows JS Number to Infinity", () => {
    // BigInt is fine, but Number(very-large-bigint) / 1e9 can become
    // Infinity. The formatter guards on !isFinite and returns null so the
    // cell falls back to the placeholder.
    const overflow = "1" + "0".repeat(320); // 10^320, well past Number.MAX_VALUE
    expect(gweiDisp(overflow)).toBeNull();
  });

  it("formats zero gwei as '0' (not null) — zero is a real value", () => {
    expect(gweiDisp("0")).toBe("0");
  });
});
