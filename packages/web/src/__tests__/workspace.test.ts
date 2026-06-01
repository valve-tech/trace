import { describe, it, expect } from "vitest";
import {
  addItem,
  createWorkspace,
  normalizeItemValue,
  removeItem,
  renameWorkspace,
} from "../lib/workspace/store";

/**
 * Pure-helper tests for the Workspace store. The IDB layer is intentionally
 * skipped here (it's a thin idb-keyval wrapper) — these tests pin the
 * invariants the UI relies on: normalized values, no duplicate items,
 * reference-equality on no-ops, updatedAt advancement.
 */

const ADDR = "0xAbC0000000000000000000000000000000000123"; // mixed case
const TX_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000abc";

describe("workspace/store — normalizeItemValue", () => {
  it("lowercases addresses + tx hashes", () => {
    expect(normalizeItemValue("address", ADDR)).toBe(ADDR.toLowerCase());
    expect(normalizeItemValue("tx", "0xABCdef")).toBe("0xabcdef");
  });
  it("preserves block numbers as-given (after trim)", () => {
    expect(normalizeItemValue("block", "  21840192  ")).toBe("21840192");
  });
});

describe("workspace/store — createWorkspace", () => {
  it("trims name and treats empty description as undefined", () => {
    const ws = createWorkspace("  Lido incident 2026-05  ", "   ");
    expect(ws.name).toBe("Lido incident 2026-05");
    expect(ws.description).toBeUndefined();
    expect(ws.items).toEqual([]);
    expect(ws.id).toBeTruthy();
    expect(ws.createdAt).toBeGreaterThan(0);
    expect(ws.updatedAt).toBe(ws.createdAt);
  });
});

describe("workspace/store — addItem", () => {
  it("appends a new item and advances updatedAt", async () => {
    const ws = createWorkspace("ws");
    // Force a real time delta so updatedAt strictly advances.
    await new Promise((r) => setTimeout(r, 2));
    const next = addItem(ws, { kind: "address", value: ADDR });
    expect(next.items).toHaveLength(1);
    expect(next.items[0]!.kind).toBe("address");
    expect(next.items[0]!.value).toBe(ADDR.toLowerCase());
    expect(next.updatedAt).toBeGreaterThan(ws.updatedAt);
  });

  it("dedupes by (kind, normalized value, chainId)", () => {
    const ws = addItem(createWorkspace("ws"), {
      kind: "address",
      value: ADDR,
      chainId: 369,
    });
    // Same address, same chain — even with different case → dedup.
    const same = addItem(ws, {
      kind: "address",
      value: ADDR.toUpperCase(),
      chainId: 369,
    });
    expect(same).toBe(ws); // reference-equal: caller can detect the no-op
    expect(same.items).toHaveLength(1);
  });

  it("treats different chainIds as distinct items", () => {
    const ws = addItem(createWorkspace("ws"), {
      kind: "address",
      value: ADDR,
      chainId: 1,
    });
    const expanded = addItem(ws, {
      kind: "address",
      value: ADDR,
      chainId: 369,
    });
    expect(expanded.items).toHaveLength(2);
  });

  it("treats address vs. tx with same value as distinct kinds", () => {
    // Vanishingly rare in practice — a "tx" + "address" with identical hex
    // — but the dedup must key on kind too, or txs/addresses could shadow.
    const ws = addItem(createWorkspace("ws"), {
      kind: "address",
      value: ADDR,
    });
    const both = addItem(ws, { kind: "tx", value: ADDR });
    expect(both.items).toHaveLength(2);
  });

  it("retains label and chainId on the new item", () => {
    const ws = addItem(createWorkspace("ws"), {
      kind: "tx",
      value: TX_HASH,
      chainId: 369,
      label: "the bug tx",
    });
    const it = ws.items[0]!;
    expect(it.label).toBe("the bug tx");
    expect(it.chainId).toBe(369);
  });
});

describe("workspace/store — removeItem", () => {
  it("removes a matching item and advances updatedAt", async () => {
    const ws = addItem(createWorkspace("ws"), {
      kind: "address",
      value: ADDR,
    });
    await new Promise((r) => setTimeout(r, 2));
    const next = removeItem(ws, ws.items[0]!.id);
    expect(next.items).toHaveLength(0);
    expect(next.updatedAt).toBeGreaterThan(ws.updatedAt);
  });

  it("is a no-op (reference-equal) when the id isn't present", () => {
    const ws = addItem(createWorkspace("ws"), {
      kind: "address",
      value: ADDR,
    });
    const same = removeItem(ws, "unknown-id");
    expect(same).toBe(ws);
  });
});

describe("workspace/store — renameWorkspace", () => {
  it("updates name and description and advances updatedAt", async () => {
    const ws = createWorkspace("old");
    await new Promise((r) => setTimeout(r, 2));
    const next = renameWorkspace(ws, "  new name  ", "  desc  ");
    expect(next.name).toBe("new name");
    expect(next.description).toBe("desc");
    expect(next.updatedAt).toBeGreaterThan(ws.updatedAt);
  });
  it("treats empty description as undefined", () => {
    const ws = createWorkspace("x", "old desc");
    const cleared = renameWorkspace(ws, "x", "   ");
    expect(cleared.description).toBeUndefined();
  });
});
