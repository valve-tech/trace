import { describe, it, expect } from "vitest";
import {
  parseServerTimestamp,
  serializeServerTimestamp,
} from "../components/monitoring/AlertDashboard/timestamps";

/**
 * Pin down the server-timestamp contract: the backend's Postgres
 * `timestamp without time zone` column comes through as an ISO string
 * with NO trailing Z. The parse helper appends Z to treat it as UTC;
 * the serialize helper drops Z to write back in the same shape.
 *
 * If the backend ever switches to `timestamp with time zone`, the
 * parse helper's `+ "Z"` will produce a double-Z string that JS
 * parses as Invalid Date — the "round trips" test catches that
 * regression loudly.
 */

describe("parseServerTimestamp", () => {
  it("parses a server-format string as UTC (not local time)", () => {
    const d = parseServerTimestamp("2026-05-30T22:00:00.000");
    expect(d.getTime()).toBe(Date.UTC(2026, 4, 30, 22, 0, 0));
  });

  it("returns a Date — not a string or number", () => {
    expect(parseServerTimestamp("2026-01-01T00:00:00.000")).toBeInstanceOf(Date);
  });

  it("a value WITHOUT milliseconds still parses (server may omit .sss)", () => {
    const d = parseServerTimestamp("2026-05-30T22:00:00");
    expect(d.getTime()).toBe(Date.UTC(2026, 4, 30, 22, 0, 0));
  });

  it("REGRESSION GUARD: an input that already has Z would produce Invalid Date", () => {
    // Documents the failure mode if the backend ever migrates to
    // `timestamp with time zone`. The helper currently always appends
    // Z, so "...ZZ" → Invalid Date. The test isn't asserting that
    // we WANT this behavior — it's pinning the failure mode so the
    // migration is discoverable rather than silent.
    const d = parseServerTimestamp("2026-05-30T22:00:00Z");
    expect(Number.isNaN(d.getTime())).toBe(true);
  });
});

describe("serializeServerTimestamp", () => {
  it("drops the trailing Z from toISOString output", () => {
    const d = new Date(Date.UTC(2026, 4, 30, 22, 0, 0));
    expect(serializeServerTimestamp(d)).toBe("2026-05-30T22:00:00.000");
  });

  it("preserves milliseconds", () => {
    const d = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 123));
    expect(serializeServerTimestamp(d)).toBe("2026-01-01T00:00:00.123");
  });
});

describe("parse / serialize round-trip", () => {
  it("serialize → parse recovers the same instant", () => {
    const d = new Date(Date.UTC(2026, 4, 30, 22, 15, 45, 678));
    const s = serializeServerTimestamp(d);
    expect(parseServerTimestamp(s).getTime()).toBe(d.getTime());
  });

  it("parse → serialize recovers the same string", () => {
    const s = "2026-05-30T22:15:45.678";
    expect(serializeServerTimestamp(parseServerTimestamp(s))).toBe(s);
  });
});
