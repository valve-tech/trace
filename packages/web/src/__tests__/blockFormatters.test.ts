import { describe, it, expect } from "vitest";
import {
  formatAgo,
  formatIsoUtc,
  formatTimestamp,
} from "../components/explorer/BlockView/formatters";

/**
 * Unit tests for BlockView timestamp formatters. The injected-now
 * design (formatTimestamp(ts, now)) lets us pin down each bucket
 * boundary precisely without manipulating the system clock.
 *
 * Buckets: <60s → "Xs ago", <1h → "Xm ago", <1d → "Xh ago", else "Xd ago"
 */

describe("formatAgo", () => {
  it("zero seconds renders as '0s ago'", () => {
    expect(formatAgo(0)).toBe("0s ago");
  });

  it("seconds bucket: 1..59 → 'Xs ago'", () => {
    expect(formatAgo(1)).toBe("1s ago");
    expect(formatAgo(59)).toBe("59s ago");
  });

  it("transition at exactly 60s switches to '1m ago'", () => {
    // 60 // 60 = 1
    expect(formatAgo(60)).toBe("1m ago");
  });

  it("minutes bucket: floors fractional minutes", () => {
    // 119s = 1m 59s → "1m ago" (NOT rounded to 2m)
    expect(formatAgo(119)).toBe("1m ago");
    expect(formatAgo(120)).toBe("2m ago");
    expect(formatAgo(3599)).toBe("59m ago");
  });

  it("transition at exactly 3600s switches to '1h ago'", () => {
    expect(formatAgo(3600)).toBe("1h ago");
  });

  it("hours bucket: floors fractional hours", () => {
    expect(formatAgo(3700)).toBe("1h ago"); // 1h 1m 40s
    expect(formatAgo(7199)).toBe("1h ago"); // 1h 59m 59s
    expect(formatAgo(7200)).toBe("2h ago");
    expect(formatAgo(86399)).toBe("23h ago");
  });

  it("transition at exactly 86400s switches to '1d ago'", () => {
    expect(formatAgo(86400)).toBe("1d ago");
  });

  it("days bucket: floors fractional days", () => {
    expect(formatAgo(86400 * 7)).toBe("7d ago"); // exactly a week
    expect(formatAgo(86400 * 365)).toBe("365d ago"); // never switches to "Xy ago"
  });

  it("negative input clamps to '0s ago' (clock-skew defense)", () => {
    // If the node's block timestamp is ahead of the user's clock, the
    // raw diff goes negative. Show "0s ago" rather than "-12s ago".
    expect(formatAgo(-12)).toBe("0s ago");
    expect(formatAgo(-1)).toBe("0s ago");
  });

  it("fractional inputs floor (Math.floor in the implementation)", () => {
    expect(formatAgo(59.9)).toBe("59s ago"); // stays in seconds bucket
    expect(formatAgo(60.4)).toBe("1m ago");
  });
});

describe("formatIsoUtc", () => {
  it("formats a date as 'YYYY-MM-DD HH:MM:SS UTC'", () => {
    // 2026-05-30T15:30:45Z
    const d = new Date(Date.UTC(2026, 4, 30, 15, 30, 45));
    expect(formatIsoUtc(d)).toBe("2026-05-30 15:30:45.000 UTC");
  });

  it("preserves milliseconds (matches the .000 in toISOString)", () => {
    const d = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 123));
    expect(formatIsoUtc(d)).toBe("2026-01-01 00:00:00.123 UTC");
  });
});

describe("formatTimestamp", () => {
  // Reference point: 2026-05-30 00:00:00 UTC in unix millis.
  const NOW = Date.UTC(2026, 4, 30, 0, 0, 0);

  it("renders the absolute UTC date with a seconds-ago suffix", () => {
    // 30 seconds before NOW
    const ts = NOW / 1000 - 30;
    const out = formatTimestamp(ts, NOW);
    expect(out).toContain("2026-05-29 23:59:30.000 UTC");
    expect(out).toContain("(30s ago)");
  });

  it("renders a 5-minute-old block as 'Xm ago'", () => {
    const ts = NOW / 1000 - 5 * 60;
    expect(formatTimestamp(ts, NOW)).toContain("(5m ago)");
  });

  it("renders a 2-hour-old block as 'Xh ago'", () => {
    const ts = NOW / 1000 - 2 * 3600;
    expect(formatTimestamp(ts, NOW)).toContain("(2h ago)");
  });

  it("renders a 3-day-old block as 'Xd ago'", () => {
    const ts = NOW / 1000 - 3 * 86400;
    expect(formatTimestamp(ts, NOW)).toContain("(3d ago)");
  });

  it("a future-dated block (clock skew) renders as '0s ago'", () => {
    const ts = NOW / 1000 + 60; // node clock 60s ahead
    expect(formatTimestamp(ts, NOW)).toContain("(0s ago)");
  });

  it("defaults the 'now' arg to Date.now() when omitted (production path)", () => {
    // Don't pin a specific bucket — just verify the call doesn't throw
    // and returns the expected absolute-time shape.
    const out = formatTimestamp(1700000000); // 2023-11-14T22:13:20Z
    expect(out).toContain("2023-11-14 22:13:20.000 UTC");
    expect(out).toMatch(/\([0-9]+[smhd] ago\)$/);
  });
});
