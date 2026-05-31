import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mergeDecodedLogs,
  otherEmitters,
  toRawLog,
  type DecodedLogEntry,
  type ReceiptLog,
} from "../../src/services/explorer/transactionDetails/transforms.js";

/**
 * Unit tests for the transactionDetails transforms. The dedupe-by-
 * logIndex merge is the load-bearing one — the second-pass log decode
 * loop in getTransactionDetails fires once per non-`to` emitter address
 * and each pass could overlap the first.
 */

function log(
  address: string,
  logIndex: number,
  overrides: Partial<ReceiptLog> = {},
): ReceiptLog {
  return {
    address,
    topics: ["0x" + "ab".repeat(32)],
    data: "0x",
    logIndex,
    ...overrides,
  };
}

function decoded(eventName: string, logIndex: number): DecodedLogEntry {
  return {
    // Use a number for `value` so test helpers can JSON.stringify the
    // entry for equality comparisons. The production code carries
    // bigints; that's irrelevant to the merge contract under test.
    eventName,
    args: [{ name: "value", type: "uint256", value: 1 }],
    address: "0x" + "11".repeat(20),
    logIndex,
  };
}

describe("toRawLog", () => {
  it("coerces numeric logIndex through Number(...)", () => {
    const out = toRawLog(log("0xaaa", 5));
    assert.equal(out.logIndex, 5);
    assert.equal(typeof out.logIndex, "number");
  });

  it("coerces a bigint logIndex (what viem sometimes returns)", () => {
    const out = toRawLog(log("0xaaa", 0, { logIndex: 99n as unknown as number }));
    assert.equal(out.logIndex, 99);
    assert.equal(typeof out.logIndex, "number");
  });

  it("flattens readonly topics to a plain string[]", () => {
    const out = toRawLog(log("0xaaa", 0));
    assert.ok(Array.isArray(out.topics));
    assert.equal(out.topics.length, 1);
  });

  it("passes address + data through unchanged", () => {
    const out = toRawLog(log("0xDeAdBeEf", 0, { data: "0xfeed" }));
    assert.equal(out.address, "0xDeAdBeEf");
    assert.equal(out.data, "0xfeed");
  });
});

describe("otherEmitters", () => {
  it("returns an empty array for no logs", () => {
    assert.deepEqual(otherEmitters([], "0xaaa"), []);
  });

  it("excludes the tx.to address (case-insensitive)", () => {
    const out = otherEmitters(
      [log("0xAAA", 0), log("0xbbb", 1), log("0xaaa", 2)],
      "0xaaa",
    );
    assert.deepEqual(out, ["0xbbb"]);
  });

  it("dedupes — one entry per distinct emitter", () => {
    const out = otherEmitters(
      [log("0xbbb", 0), log("0xbbb", 1), log("0xccc", 2)],
      "0xaaa",
    );
    assert.deepEqual(out.sort(), ["0xbbb", "0xccc"]);
  });

  it("when txTo is null, every emitter is 'other' (contract creation case)", () => {
    const out = otherEmitters([log("0xbbb", 0), log("0xccc", 1)], null);
    assert.deepEqual(out.sort(), ["0xbbb", "0xccc"]);
  });

  it("returns lowercase addresses (matches downstream filter conventions)", () => {
    const out = otherEmitters([log("0xBBB", 0)], "0xaaa");
    assert.deepEqual(out, ["0xbbb"]);
  });
});

describe("mergeDecodedLogs", () => {
  it("returns a copy of `existing` when `incoming` is empty", () => {
    const existing = [decoded("Transfer", 0)];
    const out = mergeDecodedLogs(existing, []);
    assert.deepEqual(out, existing);
    assert.notEqual(out, existing); // fresh array
  });

  it("appends entries with unseen logIndex values", () => {
    const out = mergeDecodedLogs(
      [decoded("Transfer", 0)],
      [decoded("Approval", 1)],
    );
    assert.equal(out.length, 2);
    assert.equal(out[1]!.eventName, "Approval");
  });

  it("skips an incoming entry whose logIndex is already in `existing`", () => {
    const out = mergeDecodedLogs(
      [decoded("Transfer", 5)],
      [decoded("Approval", 5)],
    );
    assert.equal(out.length, 1);
    assert.equal(out[0]!.eventName, "Transfer"); // existing kept
  });

  it("preserves existing entries unchanged on a collision", () => {
    const existingEntry = decoded("Transfer", 5);
    const out = mergeDecodedLogs(
      [existingEntry],
      [decoded("Approval", 5), decoded("Stake", 6)],
    );
    assert.equal(out[0]!.eventName, "Transfer");
    assert.equal(out[1]!.eventName, "Stake");
  });

  it("does not mutate the input arrays", () => {
    const existing = [decoded("Transfer", 0)];
    const incoming = [decoded("Approval", 1)];
    const beforeExisting = JSON.stringify(existing);
    const beforeIncoming = JSON.stringify(incoming);
    mergeDecodedLogs(existing, incoming);
    assert.equal(JSON.stringify(existing), beforeExisting);
    assert.equal(JSON.stringify(incoming), beforeIncoming);
  });

  it("dedupes within the incoming batch too", () => {
    // Two incoming entries with the same logIndex — only the first wins.
    const out = mergeDecodedLogs(
      [],
      [decoded("First", 5), decoded("Second", 5)],
    );
    assert.equal(out.length, 1);
    assert.equal(out[0]!.eventName, "First");
  });
});
