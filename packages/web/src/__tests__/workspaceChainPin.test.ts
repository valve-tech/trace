import { describe, it, expect } from "vitest";
import {
  addItem,
  createWorkspace,
  normalizeStore,
} from "../lib/workspace/store";
import { DEFAULT_CHAIN_ID } from "../lib/chains";
import type { WorkspaceStore } from "../lib/workspace/types";

/**
 * Chain pinning on workspace items: every item carries a chainId. Items
 * added without one default to 369 (PulseChain); items persisted before
 * pinning landed are backfilled to 369 by normalizeStore (they predate
 * multichain, so 369 is exact, not a guess).
 */

const ADDR = "0xabc0000000000000000000000000000000000123";

describe("workspace chain pinning — addItem", () => {
  it("defaults chainId to 369 when omitted", () => {
    const ws = addItem(createWorkspace("ws"), { kind: "address", value: ADDR });
    expect(ws.items[0]!.chainId).toBe(DEFAULT_CHAIN_ID);
  });

  it("pins the provided chainId", () => {
    const ws = addItem(createWorkspace("ws"), {
      kind: "address",
      value: ADDR,
      chainId: 1,
    });
    expect(ws.items[0]!.chainId).toBe(1);
  });

  it("dedupes an omitted chainId against an explicit 369 (same pin)", () => {
    const ws = addItem(createWorkspace("ws"), {
      kind: "address",
      value: ADDR,
      chainId: 369,
    });
    const same = addItem(ws, { kind: "address", value: ADDR });
    expect(same).toBe(ws);
    expect(same.items).toHaveLength(1);
  });
});

describe("workspace chain pinning — normalizeStore", () => {
  it("backfills items persisted without a chainId to 369", () => {
    const legacy = {
      schemaVersion: 1,
      workspaces: [
        {
          id: "w1",
          name: "old",
          createdAt: 1,
          updatedAt: 1,
          items: [
            // Pre-pinning on-disk shape: no chainId field.
            { id: "i1", kind: "address", value: ADDR, addedAt: 1 },
            { id: "i2", kind: "tx", value: `0x${"ab".repeat(32)}`, chainId: 1, addedAt: 2 },
          ],
        },
      ],
    } as unknown as WorkspaceStore;

    const normalized = normalizeStore(legacy);
    expect(normalized.workspaces[0]!.items[0]!.chainId).toBe(DEFAULT_CHAIN_ID);
    // Already-pinned items keep their chain.
    expect(normalized.workspaces[0]!.items[1]!.chainId).toBe(1);
  });

  it("does not mutate the input store", () => {
    const input = {
      schemaVersion: 1,
      workspaces: [
        {
          id: "w1",
          name: "old",
          createdAt: 1,
          updatedAt: 1,
          items: [{ id: "i1", kind: "address", value: ADDR, addedAt: 1 }],
        },
      ],
    } as unknown as WorkspaceStore;

    normalizeStore(input);
    expect(
      (input.workspaces[0]!.items[0] as { chainId?: number }).chainId,
    ).toBeUndefined();
  });
});
