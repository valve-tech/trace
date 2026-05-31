import { describe, it, expect } from "vitest";
import {
  mergeIncomingAlert,
  synthesizeAlertFromEvent,
} from "../components/monitoring/AlertDashboard/events";
import type { Alert } from "../api/alerts";
import type { AlertEvent } from "../hooks/useAlertWebSocket";

/**
 * Unit tests for the WebSocket alert merger. The list-update logic was
 * previously inline in a useEffect — extracting it makes the
 * "duplicate id → bail out" contract testable, and lets us verify that
 * the synthetic Alert built from a thin WS payload has every field the
 * card component relies on (otherwise the card crashes during the
 * brief window before the next fetch refreshes it).
 */

function event(id: number, overrides: Partial<AlertEvent["data"]["alert"]> = {}): AlertEvent {
  return {
    type: "alert_triggered",
    data: {
      alert: { id, name: `alert-${id}`, type: "address_activity", ...overrides },
      match: { summary: "matched" },
    },
    ts: 1700000000,
  };
}

function alert(id: number, overrides: Partial<Alert> = {}): Alert {
  return {
    id,
    name: `alert-${id}`,
    type: "address_activity",
    conditions: {},
    notifications: [],
    enabled: true,
    cooldown_seconds: 30,
    last_triggered_at: null as unknown as string,
    created_at: "2026-01-01T00:00:00.000",
    updated_at: "2026-01-01T00:00:00.000",
    ...overrides,
  };
}

describe("synthesizeAlertFromEvent", () => {
  const NOW = new Date(Date.UTC(2026, 4, 30, 22, 0, 0));

  it("copies id, name, type from the WS payload", () => {
    const a = synthesizeAlertFromEvent(event(42, { name: "x", type: "contract_event" }), NOW);
    expect(a.id).toBe(42);
    expect(a.name).toBe("x");
    expect(a.type).toBe("contract_event");
  });

  it("defaults conditions to an empty object (card-renderable)", () => {
    const a = synthesizeAlertFromEvent(event(1), NOW);
    expect(a.conditions).toEqual({});
  });

  it("defaults notifications to an empty array (card shows '0 channels')", () => {
    const a = synthesizeAlertFromEvent(event(1), NOW);
    expect(a.notifications).toEqual([]);
  });

  it("defaults enabled=true (it just triggered, so it must have been on)", () => {
    expect(synthesizeAlertFromEvent(event(1), NOW).enabled).toBe(true);
  });

  it("uses the same timestamp for created_at, updated_at, last_triggered_at", () => {
    const a = synthesizeAlertFromEvent(event(1), NOW);
    expect(a.created_at).toBe(a.updated_at);
    expect(a.created_at).toBe(a.last_triggered_at);
  });

  it("timestamp is in server format (no trailing Z)", () => {
    const a = synthesizeAlertFromEvent(event(1), NOW);
    expect(a.last_triggered_at).toBe("2026-05-30T22:00:00.000");
    expect(a.last_triggered_at?.endsWith("Z")).toBe(false);
  });
});

describe("mergeIncomingAlert", () => {
  const NOW = new Date(Date.UTC(2026, 4, 30, 22, 0, 0));

  it("prepends a synthesized alert when the id is not in the list", () => {
    const prev = [alert(1), alert(2)];
    const merged = mergeIncomingAlert(prev, event(3), NOW);
    expect(merged.map((a) => a.id)).toEqual([3, 1, 2]);
  });

  it("preserves the existing items unchanged when prepending", () => {
    const prev = [alert(1, { name: "keep" })];
    const merged = mergeIncomingAlert(prev, event(2), NOW);
    expect(merged[1]).toBe(prev[0]); // identity, not just equality
  });

  it("returns the SAME array reference when the id is already present (React bail-out)", () => {
    const prev = [alert(1), alert(2)];
    const merged = mergeIncomingAlert(prev, event(1), NOW);
    expect(merged).toBe(prev); // load-bearing: skips a re-render
  });

  it("accepts an empty initial list", () => {
    const merged = mergeIncomingAlert([], event(1), NOW);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe(1);
  });

  it("treats id collision as duplicate even if name/type differ", () => {
    // Server is source of truth — a WS event with the same id but a
    // changed name still bails out; the next fetch refreshes the row
    // with the canonical name.
    const prev = [alert(1, { name: "original" })];
    const merged = mergeIncomingAlert(prev, event(1, { name: "changed" }), NOW);
    expect(merged).toBe(prev);
    expect(merged[0]?.name).toBe("original");
  });
});
