import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapInternalTxRow,
  type BlockscoutInternalTxRow,
} from "../../src/services/explorer/internalTransactions/transforms.js";

/**
 * Unit tests for the internal-tx row mapper. The Blockscout
 * `txlistinternal` endpoint sends empty strings for any partial data,
 * so the defensive defaults are the load-bearing surface.
 */

function row(
  overrides: Partial<BlockscoutInternalTxRow> = {},
): BlockscoutInternalTxRow {
  return {
    from: "0x" + "11".repeat(20),
    to: "0x" + "22".repeat(20),
    value: "0",
    type: "CALL",
    gas: "21000",
    gasUsed: "21000",
    input: "0x",
    errCode: "",
    isError: "0",
    ...overrides,
  };
}

describe("mapInternalTxRow", () => {
  it("formats a 1-PLS value as '1' in valuePLS", () => {
    const out = mapInternalTxRow(row({ value: "1000000000000000000" }));
    assert.equal(out.valuePLS, "1");
    assert.equal(out.value, "1000000000000000000"); // raw preserved
  });

  it("treats an empty value as zero wei", () => {
    const out = mapInternalTxRow(row({ value: "" }));
    assert.equal(out.valuePLS, "0");
  });

  it("defaults empty type to 'CALL' (the legacy opcode default)", () => {
    const out = mapInternalTxRow(row({ type: "" }));
    assert.equal(out.type, "CALL");
  });

  it("preserves DELEGATECALL / STATICCALL / CREATE types verbatim", () => {
    for (const t of ["DELEGATECALL", "STATICCALL", "CREATE", "CREATE2"]) {
      assert.equal(mapInternalTxRow(row({ type: t })).type, t);
    }
  });

  it("defaults empty errCode to '' (not undefined)", () => {
    const out = mapInternalTxRow(row({ errCode: "" }));
    assert.equal(out.errCode, "");
  });

  it("preserves a non-empty errCode (e.g. 'Reverted')", () => {
    const out = mapInternalTxRow(row({ errCode: "Reverted" }));
    assert.equal(out.errCode, "Reverted");
  });

  it("defaults empty isError to '0' (Blockscout's success encoding)", () => {
    const out = mapInternalTxRow(row({ isError: "" }));
    assert.equal(out.isError, "0");
  });

  it("preserves '1' for failed internal calls", () => {
    const out = mapInternalTxRow(row({ isError: "1" }));
    assert.equal(out.isError, "1");
  });

  it("copies from / to / gas / gasUsed / input through verbatim", () => {
    const out = mapInternalTxRow(
      row({
        from: "0xaaa",
        to: "0xbbb",
        gas: "100000",
        gasUsed: "50000",
        input: "0xcafebabe",
      }),
    );
    assert.equal(out.from, "0xaaa");
    assert.equal(out.to, "0xbbb");
    assert.equal(out.gas, "100000");
    assert.equal(out.gasUsed, "50000");
    assert.equal(out.input, "0xcafebabe");
  });
});
