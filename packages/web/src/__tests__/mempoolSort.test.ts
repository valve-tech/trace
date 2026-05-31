import { describe, it, expect } from "vitest";
import {
  compareTx,
  distinctTypes,
  filterAndSortPending,
  type SortKey,
} from "../components/mempool/MempoolView/sort";
import type { PendingTx } from "../api/mempool";

/**
 * Unit tests for the sort/filter pipeline extracted from MempoolView. The
 * three helpers cover: the comparator (per-key tie-break logic), the
 * filter-chip enumerator (UX), and the orchestrator that the useMemo in
 * the view calls. Testing the orchestrator end-to-end is the highest-
 * leverage check — it exercises filter composition + sort stability.
 */

function tx(overrides: Partial<PendingTx> = {}): PendingTx {
  return {
    hash: "0x" + "a".repeat(64),
    from: "0x" + "b".repeat(40),
    nonce: 0,
    type: "eip1559",
    gasPrice: null,
    maxFeePerGas: "1000000000",
    maxPriorityFeePerGas: "500000000",
    ...overrides,
  };
}

describe("compareTx", () => {
  it("'rank' is a no-op (preserves the server's effective-tip order)", () => {
    const a = tx({ nonce: 1 });
    const b = tx({ nonce: 999 });
    expect(compareTx(a, b, "rank")).toBe(0);
  });

  it("'tip' sorts descending by maxPriorityFeePerGas", () => {
    const lo = tx({ maxPriorityFeePerGas: "1" });
    const hi = tx({ maxPriorityFeePerGas: "10" });
    expect(compareTx(lo, hi, "tip")).toBeGreaterThan(0); // hi comes first
    expect(compareTx(hi, lo, "tip")).toBeLessThan(0);
  });

  it("'tip' falls back to gasPrice when maxPriorityFeePerGas is null (legacy tx)", () => {
    const legacy = tx({ maxPriorityFeePerGas: null, gasPrice: "100" });
    const eip1559 = tx({ maxPriorityFeePerGas: "50", gasPrice: null });
    // legacy (tip=100) should outrank eip1559 (tip=50)
    expect(compareTx(eip1559, legacy, "tip")).toBeGreaterThan(0);
  });

  it("'cap' sorts descending by maxFeePerGas", () => {
    const lo = tx({ maxFeePerGas: "1" });
    const hi = tx({ maxFeePerGas: "1000" });
    expect(compareTx(lo, hi, "cap")).toBeGreaterThan(0);
  });

  it("'nonce' sorts ascending (the user wants to see the next-to-mine first)", () => {
    const low = tx({ nonce: 5 });
    const high = tx({ nonce: 99 });
    expect(compareTx(low, high, "nonce")).toBeLessThan(0);
    expect(compareTx(high, low, "nonce")).toBeGreaterThan(0);
  });

  it("treats a tx missing all fee fields as zero (no throw)", () => {
    const empty = tx({
      maxPriorityFeePerGas: null,
      maxFeePerGas: null,
      gasPrice: null,
    });
    const ok = tx({ maxPriorityFeePerGas: "1" });
    expect(compareTx(empty, ok, "tip")).toBeGreaterThan(0);
    expect(compareTx(empty, ok, "cap")).toBeGreaterThan(0);
  });
});

describe("distinctTypes", () => {
  it("returns an empty array for an empty batch", () => {
    expect(distinctTypes([])).toEqual([]);
  });

  it("returns a single entry when all txs share a type", () => {
    expect(
      distinctTypes([tx({ type: "eip1559" }), tx({ type: "eip1559" })]),
    ).toEqual(["eip1559"]);
  });

  it("dedupes and sorts alphabetically", () => {
    const out = distinctTypes([
      tx({ type: "legacy" }),
      tx({ type: "eip1559" }),
      tx({ type: "eip2930" }),
      tx({ type: "eip1559" }),
    ]);
    expect(out).toEqual(["eip1559", "eip2930", "legacy"]);
  });
});

describe("filterAndSortPending", () => {
  const a = tx({
    hash: "0xaaa" + "0".repeat(61),
    from: "0xaaa" + "0".repeat(37),
    nonce: 5,
    type: "eip1559",
    maxPriorityFeePerGas: "100",
  });
  const b = tx({
    hash: "0xbbb" + "0".repeat(61),
    from: "0xbbb" + "0".repeat(37),
    nonce: 1,
    type: "legacy",
    maxPriorityFeePerGas: null,
    gasPrice: "50",
  });
  const c = tx({
    hash: "0xccc" + "0".repeat(61),
    from: "0xccc" + "0".repeat(37),
    nonce: 9,
    type: "eip1559",
    maxPriorityFeePerGas: "200",
  });

  const noFilter = {
    search: "",
    typeFilter: new Set<string>(),
    sortKey: "rank" as SortKey,
  };

  it("returns a fresh array (doesn't mutate the input) even with no filters", () => {
    const input = [a, b, c];
    const out = filterAndSortPending(input, noFilter);
    expect(out).not.toBe(input); // identity differs
    expect(out).toEqual(input); // contents match
  });

  it("'rank' preserves input order even when other keys would reshuffle", () => {
    const out = filterAndSortPending([a, b, c], noFilter);
    expect(out.map((t) => t.hash)).toEqual([a.hash, b.hash, c.hash]);
  });

  it("'tip' sorts highest priority fee first (legacy gasPrice counted as tip)", () => {
    const out = filterAndSortPending([a, b, c], {
      ...noFilter,
      sortKey: "tip",
    });
    // c=200, a=100, b=50
    expect(out.map((t) => t.hash)).toEqual([c.hash, a.hash, b.hash]);
  });

  it("'nonce' sorts ascending", () => {
    const out = filterAndSortPending([a, b, c], {
      ...noFilter,
      sortKey: "nonce",
    });
    // b=1, a=5, c=9
    expect(out.map((t) => t.hash)).toEqual([b.hash, a.hash, c.hash]);
  });

  it("search matches a substring of the hash, case-insensitively", () => {
    const out = filterAndSortPending([a, b, c], {
      ...noFilter,
      search: "0xCCC",
    });
    expect(out).toEqual([c]);
  });

  it("search matches a substring of the from-address", () => {
    const out = filterAndSortPending([a, b, c], { ...noFilter, search: "bbb" });
    expect(out).toEqual([b]);
  });

  it("whitespace-only search is treated as no search", () => {
    const out = filterAndSortPending([a, b, c], {
      ...noFilter,
      search: "   ",
    });
    expect(out).toHaveLength(3);
  });

  it("empty typeFilter set means 'all types pass' (not 'nothing passes')", () => {
    const out = filterAndSortPending([a, b, c], noFilter);
    expect(out).toHaveLength(3);
  });

  it("non-empty typeFilter keeps only the listed types", () => {
    const out = filterAndSortPending([a, b, c], {
      ...noFilter,
      typeFilter: new Set(["legacy"]),
    });
    expect(out).toEqual([b]);
  });

  it("composes search + type-filter + sort in one pass", () => {
    // Keep only eip1559 (a, c), sort by tip desc → [c, a]
    const out = filterAndSortPending([a, b, c], {
      search: "0x",
      typeFilter: new Set(["eip1559"]),
      sortKey: "tip",
    });
    expect(out.map((t) => t.hash)).toEqual([c.hash, a.hash]);
  });
});
