import { describe, it, expect, beforeEach } from "vitest";
import {
  getSnapshot,
  recordDebuggerTx,
  removeDebuggerTx,
  clearDebuggerTxs,
} from "../lib/recentDebuggerTxs";

beforeEach(() => {
  clearDebuggerTxs();
});

describe("recentDebuggerTxs", () => {
  it("records a tx to the front", () => {
    recordDebuggerTx("0xaaa");
    recordDebuggerTx("0xbbb");
    expect(getSnapshot().map((t) => t.hash)).toEqual(["0xbbb", "0xaaa"]);
  });

  it("de-duplicates and bumps an existing tx to the front (case-insensitive)", () => {
    recordDebuggerTx("0xAaA");
    recordDebuggerTx("0xbbb");
    recordDebuggerTx("0xaaa");
    const hashes = getSnapshot().map((t) => t.hash);
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).toBe("0xaaa");
  });

  it("caps the list at 12 entries", () => {
    for (let i = 0; i < 20; i++) recordDebuggerTx(`0x${i}`);
    expect(getSnapshot()).toHaveLength(12);
    // Newest (0x19) first, oldest retained is 0x8.
    expect(getSnapshot()[0]?.hash).toBe("0x19");
  });

  it("removes and clears", () => {
    recordDebuggerTx("0xaaa");
    recordDebuggerTx("0xbbb");
    removeDebuggerTx("0xaaa");
    expect(getSnapshot().map((t) => t.hash)).toEqual(["0xbbb"]);
    clearDebuggerTxs();
    expect(getSnapshot()).toEqual([]);
  });
});
