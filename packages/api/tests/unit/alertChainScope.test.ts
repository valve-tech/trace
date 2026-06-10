/**
 * Unit tests for the chainid plumbing on the alerts surface:
 *
 *   - routes/alerts/schemas.ts — `chainid` accepted (string or number),
 *     optional, and the per-type condition refinement still fires
 *   - routes/alerts/serialize.ts — formatAlertRow exposes `chainid`
 *   - types.ts — simulate schemas accept a `chainid` field
 *
 * Pure schema/serializer tests — no DB, no server.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createAlertSchema } from "../../src/routes/alerts/schemas.js";
import { formatAlertRow } from "../../src/routes/alerts/serialize.js";
import type { AlertRow } from "../../src/services/db.js";
import {
  simulateRequestSchema,
  simulateBundleRequestSchema,
} from "../../src/types.js";

const ADDR = "0x2222222222222222222222222222222222222222";

const baseAlert = {
  name: "test",
  type: "address_activity" as const,
  conditions: { address: ADDR },
  notifications: [],
};

describe("alerts schema — chainid field", () => {
  it("parses without chainid (legacy payloads stay valid)", () => {
    const parsed = createAlertSchema.parse(baseAlert);
    assert.equal(parsed.chainid, undefined);
  });

  it("coerces a string chainid to a number", () => {
    const parsed = createAlertSchema.parse({ ...baseAlert, chainid: "943" });
    assert.equal(parsed.chainid, 943);
  });

  it("accepts a numeric chainid", () => {
    const parsed = createAlertSchema.parse({ ...baseAlert, chainid: 1 });
    assert.equal(parsed.chainid, 1);
  });

  it("rejects a non-numeric chainid", () => {
    const result = createAlertSchema.safeParse({ ...baseAlert, chainid: "x" });
    assert.equal(result.success, false);
  });

  it("still surfaces condition errors under conditions.<field>", () => {
    const result = createAlertSchema.safeParse({
      ...baseAlert,
      chainid: 369,
      conditions: { address: "nope" },
    });
    assert.equal(result.success, false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      assert.ok(paths.includes("conditions.address"), paths.join(", "));
    }
  });
});

describe("alerts serializer — chainid on the wire", () => {
  it("maps the chain_id column to a `chainid` wire field", () => {
    const row: AlertRow = {
      id: 7,
      name: "n",
      type: "address_activity",
      chain_id: 943,
      conditions: { address: ADDR },
      notifications: [],
      enabled: true,
      cooldown_seconds: 60,
      last_triggered_at: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    const wire = formatAlertRow(row);
    assert.ok(wire);
    assert.equal(wire.chainid, 943);
  });

  it("returns null for an undefined row", () => {
    assert.equal(formatAlertRow(undefined), null);
  });
});

describe("simulate schemas — chainid field", () => {
  it("simulateRequestSchema accepts + coerces chainid and stays optional", () => {
    assert.equal(simulateRequestSchema.parse({ to: ADDR }).chainid, undefined);
    assert.equal(
      simulateRequestSchema.parse({ to: ADDR, chainid: "1" }).chainid,
      1,
    );
  });

  it("simulateBundleRequestSchema accepts a bundle-level chainid", () => {
    const parsed = simulateBundleRequestSchema.parse({
      transactions: [{ to: ADDR }],
      chainid: 943,
    });
    assert.equal(parsed.chainid, 943);
  });
});
