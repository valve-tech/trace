import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHeimdallStorage } from "../../src/services/decompiler/heimdall.js";

/**
 * Unit tests for the pure parts of the heimdall integration. The shell-
 * exec side is tested separately (and skipped when heimdall isn't on
 * PATH); the JSON parser HAS to survive heimdall's schema drift across
 * versions, since we run whichever version the operator installed.
 */

describe("parseHeimdallStorage", () => {
  it("returns [] for empty / non-JSON input", () => {
    assert.deepEqual(parseHeimdallStorage(""), []);
    assert.deepEqual(parseHeimdallStorage("not json"), []);
    assert.deepEqual(parseHeimdallStorage("null"), []);
  });

  it("parses v0.7-style { storage: { '0x...': {...} } } shape", () => {
    const json = JSON.stringify({
      storage: {
        "0x0000000000000000000000000000000000000000000000000000000000000000": {
          type: "address",
          modifiers: ["read", "write"],
          name: "owner",
        },
      },
    });
    const out = parseHeimdallStorage(json);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.slot, "0x0000000000000000000000000000000000000000000000000000000000000000");
    assert.equal(out[0]!.inferredType, "address");
    assert.equal(out[0]!.name, "owner");
    assert.deepEqual(out[0]!.access.sort(), ["read", "write"]);
  });

  it("parses v0.8-style flat { '0x...': {...} } shape", () => {
    const json = JSON.stringify({
      "0x0000000000000000000000000000000000000000000000000000000000000001": {
        type: "uint256",
        modifiers: ["sload"],
      },
    });
    const out = parseHeimdallStorage(json);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.inferredType, "uint256");
    assert.deepEqual(out[0]!.access, ["read"]); // 'sload' synonym → 'read'
  });

  it("treats 'sstore' as a write access", () => {
    const json = JSON.stringify({
      "0xff": { modifiers: ["sstore"] },
    });
    const out = parseHeimdallStorage(json);
    assert.deepEqual(out[0]!.access, ["write"]);
  });

  it("defaults access to ['read'] when modifiers list is missing", () => {
    // Heimdall's older builds sometimes list a slot without modifiers.
    // Treat its presence as "at least read" rather than dropping the
    // entry — the slot showed up because heimdall TOUCHED it.
    const json = JSON.stringify({
      "0x01": { type: "bytes32" },
    });
    const out = parseHeimdallStorage(json);
    assert.deepEqual(out[0]!.access, ["read"]);
  });

  it("skips keys that don't look like hex slot literals", () => {
    // Heimdall has occasionally emitted top-level metadata keys
    // ("version", "elapsed") alongside the slot map. We only want the
    // actual slot entries.
    const json = JSON.stringify({
      version: "0.8.3",
      elapsed: 12.4,
      "0xab": { modifiers: ["read"] },
    });
    const out = parseHeimdallStorage(json);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.slot, "0xab");
  });

  it("handles multiple slots, preserving inferred metadata per entry", () => {
    const json = JSON.stringify({
      "0x00": { type: "address", modifiers: ["read", "write"], name: "owner" },
      "0x01": { type: "uint256", modifiers: ["sload"] },
      "0x02": { modifiers: ["sstore"] },
    });
    const out = parseHeimdallStorage(json);
    assert.equal(out.length, 3);
    const byKey: Record<string, typeof out[number]> = {};
    for (const r of out) byKey[r.slot] = r;
    assert.equal(byKey["0x00"]!.name, "owner");
    assert.equal(byKey["0x01"]!.inferredType, "uint256");
    assert.equal(byKey["0x02"]!.inferredType, null);
  });

  it("inferredType is null when heimdall couldn't narrow it", () => {
    const json = JSON.stringify({
      "0xab": { modifiers: ["read"] }, // no `type` field
    });
    const out = parseHeimdallStorage(json);
    assert.equal(out[0]!.inferredType, null);
  });

  it("name is null when no inferred-name was provided", () => {
    const json = JSON.stringify({
      "0xab": { modifiers: ["read"], type: "uint256" },
    });
    const out = parseHeimdallStorage(json);
    assert.equal(out[0]!.name, null);
  });
});
