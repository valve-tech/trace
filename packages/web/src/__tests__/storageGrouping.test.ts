import { describe, it, expect } from "vitest";
import { groupByContract } from "../components/StorageLayoutViewer/grouping";
import type { StorageEntry } from "../components/StorageLayoutViewer/types";

/**
 * Unit tests for the entries-by-contract grouping. Tiny function, but
 * order matters: solc interleaves inherited-contract slots with leaf
 * slots, and the viewer renders one section per contract in
 * first-appearance order.
 */

function entry(contract: string, label: string, slot = "0"): StorageEntry {
  return { label, slot, offset: 0, type: "t_uint256", contract };
}

describe("groupByContract", () => {
  it("returns an empty Map for an empty input", () => {
    expect(groupByContract([]).size).toBe(0);
  });

  it("collects all entries with the same contract into one bucket", () => {
    const input = [entry("Token", "a"), entry("Token", "b"), entry("Token", "c")];
    const out = groupByContract(input);
    expect(out.size).toBe(1);
    expect(out.get("Token")?.map((e) => e.label)).toEqual(["a", "b", "c"]);
  });

  it("preserves entry order within a contract bucket", () => {
    // Even when interleaved across contracts, entries within one bucket
    // keep their input order (which is solc's declared-slot order).
    const input = [
      entry("Token", "x"),
      entry("Base", "y"),
      entry("Token", "z"),
    ];
    expect(groupByContract(input).get("Token")?.map((e) => e.label)).toEqual([
      "x",
      "z",
    ]);
  });

  it("preserves first-appearance order of contracts in Map iteration", () => {
    // Map iteration follows insertion order; this test pins that down so
    // a refactor to Object.entries (which DOES NOT guarantee order for
    // string keys with numeric look-alikes) would break the test.
    const input = [
      entry("ZContract", "a"),
      entry("AContract", "b"),
      entry("MContract", "c"),
      entry("AContract", "d"),
    ];
    const keys = [...groupByContract(input).keys()];
    expect(keys).toEqual(["ZContract", "AContract", "MContract"]);
  });

  it("does not mutate the input array", () => {
    const input = [entry("Token", "a")] as const;
    const before = JSON.stringify(input);
    groupByContract(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
