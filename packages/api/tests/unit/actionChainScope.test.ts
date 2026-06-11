/**
 * Unit tests for the chainid plumbing on the Web3 Actions surface:
 *
 *   - routes/actions/schemas.ts — `chainid` accepted (string or number),
 *     optional on create and update
 *   - routes/actions/serialize.ts — formatAction exposes `chainid` and
 *     still never leaks secret values
 *
 * Pure schema/serializer tests — no DB, no server (same shape as
 * alertChainScope.test.ts).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createActionSchema,
  updateActionSchema,
} from "../../src/routes/actions/schemas.js";
import { formatAction } from "../../src/routes/actions/serialize.js";
import type { ActionRow } from "../../src/services/actionsDb.js";

const baseAction = {
  name: "test",
  triggerType: "block" as const,
};

describe("actions schema — chainid field", () => {
  it("parses without chainid (legacy payloads stay valid)", () => {
    const parsed = createActionSchema.parse(baseAction);
    assert.equal(parsed.chainid, undefined);
  });

  it("coerces a string chainid to a number", () => {
    const parsed = createActionSchema.parse({ ...baseAction, chainid: "943" });
    assert.equal(parsed.chainid, 943);
  });

  it("accepts a numeric chainid", () => {
    const parsed = createActionSchema.parse({ ...baseAction, chainid: 1 });
    assert.equal(parsed.chainid, 1);
  });

  it("rejects a non-numeric chainid", () => {
    const result = createActionSchema.safeParse({ ...baseAction, chainid: "x" });
    assert.equal(result.success, false);
  });

  it("updateActionSchema accepts an optional chainid", () => {
    assert.equal(updateActionSchema.parse({}).chainid, undefined);
    assert.equal(updateActionSchema.parse({ chainid: "369" }).chainid, 369);
  });
});

describe("actions serializer — chainid on the wire", () => {
  const row: ActionRow = {
    id: 7,
    name: "n",
    code: "",
    chain_id: 943,
    trigger_type: "block",
    trigger_config: {},
    secrets: { API_KEY: "hunter2" },
    storage: {},
    enabled: true,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };

  it("maps the chain_id column to a `chainid` wire field", () => {
    assert.equal(formatAction(row).chainid, 943);
  });

  it("still exposes secret key names only, never values", () => {
    const wire = formatAction(row) as Record<string, unknown>;
    assert.deepEqual(wire.secretKeys, ["API_KEY"]);
    assert.equal(JSON.stringify(wire).includes("hunter2"), false);
  });
});
