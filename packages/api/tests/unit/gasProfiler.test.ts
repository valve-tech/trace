/**
 * Unit tests for the gas profiler.
 *
 * All test frames use input "0x" or "" so decodeFunctionName returns
 * "(fallback)" immediately — no network call to BlockScout is made.
 * This keeps the tests fully offline while still exercising every
 * aggregation, flatten, and sort path in profileGas.ts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { profileGas } from "../../src/services/gasProfiler/profileGas.js";
import type { CallFrame } from "../../src/services/tracer/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function frame(
  overrides: Partial<CallFrame> & { gasUsed: string | number },
): CallFrame {
  return {
    type: "CALL",
    from: "0xaaaa",
    to: "0xbbbb",
    gas: "0xffffff",
    input: "0x",
    ...overrides,
    gasUsed: String(overrides.gasUsed),
  };
}

// ---------------------------------------------------------------------------
// Single-call tree
// ---------------------------------------------------------------------------

describe("profileGas — single call (no children)", () => {
  it("reports totalGas equal to gasUsed on the root frame", async () => {
    const root = frame({ gasUsed: 1000 });
    const result = await profileGas(root);
    assert.equal(result.totalGas, 1000);
  });

  it("selfGas equals totalGas when there are no children", async () => {
    const root = frame({ gasUsed: 500 });
    const result = await profileGas(root);
    assert.equal(result.entries[0]!.gasUsed, 500);
    assert.equal(result.entries[0]!.totalGas, 500);
  });

  it("percentage is 100 for the lone root entry", async () => {
    const root = frame({ gasUsed: 200 });
    const result = await profileGas(root);
    assert.equal(result.entries[0]!.percentage, 100);
  });

  it("flat list contains exactly one entry", async () => {
    const root = frame({ gasUsed: 100 });
    const result = await profileGas(root);
    assert.equal(result.flat.length, 1);
  });

  it("callType defaults to CALL when frame.type is undefined", async () => {
    const root: CallFrame = {
      from: "0xaaaa",
      to: "0xbbbb",
      gas: "0xffffff",
      input: "0x",
      gasUsed: "300",
      type: undefined as unknown as string,
    };
    const result = await profileGas(root);
    assert.equal(result.entries[0]!.callType, "CALL");
  });
});

// ---------------------------------------------------------------------------
// Two-level tree
// ---------------------------------------------------------------------------

describe("profileGas — two-level tree", () => {
  // Root uses 1000 gas total; child A uses 400, child B uses 300.
  // Root self gas = 1000 - (400 + 300) = 300.

  const buildTree = () =>
    frame({
      type: "CALL",
      to: "0xroot",
      gasUsed: 1000,
      calls: [
        frame({ type: "STATICCALL", to: "0xchild_a", gasUsed: 400 }),
        frame({ type: "DELEGATECALL", to: "0xchild_b", gasUsed: 300 }),
      ],
    });

  it("root selfGas = total - sum of children totalGas", async () => {
    const result = await profileGas(buildTree());
    assert.equal(result.entries[0]!.gasUsed, 300); // 1000 - 400 - 300
  });

  it("children appear in entries[0].children in call order", async () => {
    const result = await profileGas(buildTree());
    const children = result.entries[0]!.children;
    assert.equal(children.length, 2);
    assert.equal(children[0]!.address, "0xchild_a");
    assert.equal(children[1]!.address, "0xchild_b");
  });

  it("children have depth=1, root has depth=0", async () => {
    const result = await profileGas(buildTree());
    assert.equal(result.entries[0]!.depth, 0);
    assert.equal(result.entries[0]!.children[0]!.depth, 1);
    assert.equal(result.entries[0]!.children[1]!.depth, 1);
  });

  it("flat list is sorted by gasUsed descending", async () => {
    const result = await profileGas(buildTree());
    const gasValues = result.flat.map((e) => e.gasUsed);
    const sorted = [...gasValues].sort((a, b) => b - a);
    assert.deepEqual(gasValues, sorted);
  });

  it("flat list contains root + all descendants", async () => {
    const result = await profileGas(buildTree());
    assert.equal(result.flat.length, 3);
  });

  it("flat entry for root carries totalGas (inclusive), not selfGas", async () => {
    const result = await profileGas(buildTree());
    const rootFlat = result.flat.find((e) => e.address === "0xroot")!;
    // flattenEntries pushes totalGas into the flat gasUsed field
    assert.equal(rootFlat.gasUsed, 1000);
  });
});

// ---------------------------------------------------------------------------
// Per-call-type rollup
// ---------------------------------------------------------------------------

describe("profileGas — byCallType rollup", () => {
  it("counts CALL gas and STATICCALL gas into separate keys", async () => {
    const root = frame({
      type: "CALL",
      to: "0xroot",
      gasUsed: 1000,
      calls: [
        frame({ type: "STATICCALL", to: "0xsc", gasUsed: 200 }),
      ],
    });
    const result = await profileGas(root);
    // root selfGas = 1000 - 200 = 800
    assert.equal(result.byCallType["CALL"], 800);
    assert.equal(result.byCallType["STATICCALL"], 200);
  });

  it("accumulates DELEGATECALL across sibling frames", async () => {
    const root = frame({
      type: "CALL",
      to: "0xroot",
      gasUsed: 900,
      calls: [
        frame({ type: "DELEGATECALL", to: "0xd1", gasUsed: 300 }),
        frame({ type: "DELEGATECALL", to: "0xd2", gasUsed: 200 }),
      ],
    });
    const result = await profileGas(root);
    // root self = 900 - 300 - 200 = 400
    assert.equal(result.byCallType["CALL"], 400);
    assert.equal(result.byCallType["DELEGATECALL"], 500); // 300 + 200
  });

  it("handles all three call types in one tree", async () => {
    const root = frame({
      type: "CALL",
      to: "0xroot",
      gasUsed: 1000,
      calls: [
        frame({ type: "STATICCALL", to: "0xsc", gasUsed: 300 }),
        frame({ type: "DELEGATECALL", to: "0xdc", gasUsed: 200 }),
      ],
    });
    const result = await profileGas(root);
    // root self = 1000 - 300 - 200 = 500
    assert.equal(result.byCallType["CALL"], 500);
    assert.equal(result.byCallType["STATICCALL"], 300);
    assert.equal(result.byCallType["DELEGATECALL"], 200);
  });
});

// ---------------------------------------------------------------------------
// Edge cases: missing / zero gasUsed
// ---------------------------------------------------------------------------

describe("profileGas — edge cases", () => {
  it("treats undefined gasUsed as 0 (no crash)", async () => {
    const root = frame({ gasUsed: undefined as unknown as string });
    const result = await profileGas(root);
    assert.equal(result.totalGas, 0);
    assert.equal(result.entries[0]!.totalGas, 0);
    assert.equal(result.entries[0]!.percentage, 0);
  });

  it("treats empty-string gasUsed as 0", async () => {
    const root = frame({ gasUsed: "" });
    const result = await profileGas(root);
    assert.equal(result.totalGas, 0);
  });

  it("parses hex gasUsed strings (0x-prefixed)", async () => {
    const root = frame({ gasUsed: "0x3e8" }); // 0x3e8 = 1000
    const result = await profileGas(root);
    assert.equal(result.totalGas, 1000);
  });

  it("selfGas is clamped to 0 when children exceed parent gasUsed", async () => {
    // Reverted sub-calls can make children appear to consume more gas than
    // the parent reports. selfGas must not go negative.
    const root = frame({
      type: "CALL",
      to: "0xroot",
      gasUsed: 100,
      calls: [
        frame({ type: "CALL", to: "0xchild", gasUsed: 200 }),
      ],
    });
    const result = await profileGas(root);
    assert.equal(result.entries[0]!.gasUsed, 0); // clamped, not -100
  });

  it("percentage is clamped to 100 when child exceeds root total", async () => {
    const root = frame({
      type: "CALL",
      to: "0xroot",
      gasUsed: 50,
      calls: [
        frame({ type: "CALL", to: "0xchild", gasUsed: 200 }),
      ],
    });
    const result = await profileGas(root);
    const childEntry = result.entries[0]!.children[0]!;
    assert.ok(childEntry.percentage <= 100, "percentage must be ≤ 100");
  });

  it("empty calls array is treated like no children", async () => {
    const root = frame({ gasUsed: 500, calls: [] });
    const result = await profileGas(root);
    assert.equal(result.entries[0]!.children.length, 0);
    assert.equal(result.entries[0]!.gasUsed, 500);
  });

  it("deeply nested tree accumulates depth correctly", async () => {
    const root = frame({
      type: "CALL",
      to: "0xA",
      gasUsed: 1000,
      calls: [
        frame({
          type: "CALL",
          to: "0xB",
          gasUsed: 500,
          calls: [
            frame({ type: "CALL", to: "0xC", gasUsed: 200 }),
          ],
        }),
      ],
    });
    const result = await profileGas(root);
    const entryB = result.entries[0]!.children[0]!;
    const entryC = entryB.children[0]!;
    assert.equal(result.entries[0]!.depth, 0);
    assert.equal(entryB.depth, 1);
    assert.equal(entryC.depth, 2);
  });

  it("flat list from deep tree is sorted by gasUsed descending", async () => {
    const root = frame({
      type: "CALL",
      to: "0xA",
      gasUsed: 1000,
      calls: [
        frame({
          type: "CALL",
          to: "0xB",
          gasUsed: 500,
          calls: [
            frame({ type: "CALL", to: "0xC", gasUsed: 200 }),
          ],
        }),
      ],
    });
    const result = await profileGas(root);
    const gasValues = result.flat.map((e) => e.gasUsed);
    const sorted = [...gasValues].sort((a, b) => b - a);
    assert.deepEqual(gasValues, sorted);
  });
});
