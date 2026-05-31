import { describe, it, expect } from "vitest";
import {
  resolveTypeInfo,
  KNOWN_ALERT_TYPES,
} from "../components/monitoring/AlertDashboard/typeInfo";

/**
 * Unit tests for the alert type-badge lookup. The fallback path is the
 * load-bearing one — when the backend introduces a new alert kind, the
 * frontend has to render something readable instead of throwing on
 * undefined.access in the badge component.
 */

describe("resolveTypeInfo", () => {
  it("returns the canonical metadata for a known type", () => {
    const info = resolveTypeInfo("address_activity");
    expect(info.label).toBe("Address");
    expect(info.color).toBe("var(--color-accent)");
    expect(info.bg).toBe("var(--color-accent-muted)");
  });

  it("returns metadata for every documented alert type (no nulls)", () => {
    for (const t of KNOWN_ALERT_TYPES) {
      const info = resolveTypeInfo(t);
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.color.length).toBeGreaterThan(0);
      expect(info.bg.length).toBeGreaterThan(0);
    }
  });

  it("falls back with the raw type as the label when the type is unknown", () => {
    const info = resolveTypeInfo("brand_new_alert_kind");
    expect(info.label).toBe("brand_new_alert_kind");
  });

  it("fallback uses neutral colors (not a known type's color)", () => {
    const info = resolveTypeInfo("unknown");
    expect(info.color).toBe("var(--color-text-secondary)");
    expect(info.bg).toBe("var(--color-bg-tertiary)");
  });

  it("does not mutate the shared registry — repeat calls return fresh-equivalent objects", () => {
    // Returning a frozen-ish reference is fine as long as no caller
    // mutates it. We just verify successive calls don't drift.
    const a = resolveTypeInfo("contract_event");
    const b = resolveTypeInfo("contract_event");
    expect(a).toEqual(b);
  });

  it("includes the five documented alert types", () => {
    expect(KNOWN_ALERT_TYPES.sort()).toEqual(
      [
        "address_activity",
        "balance_threshold",
        "contract_event",
        "failed_tx",
        "function_call",
      ].sort(),
    );
  });
});
