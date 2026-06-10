import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { flattenInternalCalls } from "../../src/services/explorer/internalTransactions/transforms.js";
import type { CallFrame } from "../../src/services/tracer.js";

/**
 * Unit tests for the call-tree flattener. The root frame is the top-level
 * transaction itself — only descendants are "internal" — and hex
 * quantities map to decimal strings with defensive zero fallbacks.
 */

function frame(overrides: Partial<CallFrame> = {}): CallFrame {
  return {
    type: "CALL",
    from: "0x" + "11".repeat(20),
    to: "0x" + "22".repeat(20),
    value: "0x0",
    gas: "0x5208",
    gasUsed: "0x5208",
    input: "0x",
    ...overrides,
  };
}

describe("flattenInternalCalls", () => {
  it("excludes the root frame and returns descendants depth-first", () => {
    const root = frame({
      calls: [
        frame({ to: "0xaaa0000000000000000000000000000000000001", calls: [
          frame({ to: "0xaaa0000000000000000000000000000000000002" }),
        ] }),
        frame({ to: "0xaaa0000000000000000000000000000000000003" }),
      ],
    });
    const out = flattenInternalCalls(root);
    assert.equal(out.length, 3);
    assert.deepEqual(
      out.map((t) => t.to),
      [
        "0xaaa0000000000000000000000000000000000001",
        "0xaaa0000000000000000000000000000000000002",
        "0xaaa0000000000000000000000000000000000003",
      ],
    );
  });

  it("returns [] for a leaf root (no internal calls)", () => {
    assert.deepEqual(flattenInternalCalls(frame()), []);
  });

  it("converts hex value to decimal and formats valuePLS", () => {
    const root = frame({
      calls: [frame({ value: "0xde0b6b3a7640000" })], // 1e18
    });
    const out = flattenInternalCalls(root);
    assert.equal(out[0]!.value, "1000000000000000000");
    assert.equal(out[0]!.valuePLS, "1");
  });

  it("treats a missing value as zero wei", () => {
    const root = frame({ calls: [frame({ value: undefined })] });
    const out = flattenInternalCalls(root);
    assert.equal(out[0]!.value, "0");
    assert.equal(out[0]!.valuePLS, "0");
  });

  it("converts hex gas figures to decimal strings", () => {
    const root = frame({
      calls: [frame({ gas: "0x5208", gasUsed: "0x5208" })],
    });
    const out = flattenInternalCalls(root);
    assert.equal(out[0]!.gas, "21000");
    assert.equal(out[0]!.gasUsed, "21000");
  });

  it("maps a frame error to errCode + isError '1'", () => {
    const root = frame({
      calls: [frame({ error: "execution reverted" })],
    });
    const out = flattenInternalCalls(root);
    assert.equal(out[0]!.errCode, "execution reverted");
    assert.equal(out[0]!.isError, "1");
  });

  it("defaults a clean frame to errCode '' + isError '0'", () => {
    const out = flattenInternalCalls(frame({ calls: [frame()] }));
    assert.equal(out[0]!.errCode, "");
    assert.equal(out[0]!.isError, "0");
  });

  it("defaults a missing type to CALL and preserves DELEGATECALL", () => {
    const root = frame({
      calls: [
        frame({ type: "" }),
        frame({ type: "DELEGATECALL" }),
      ],
    });
    const out = flattenInternalCalls(root);
    assert.equal(out[0]!.type, "CALL");
    assert.equal(out[1]!.type, "DELEGATECALL");
  });
});
