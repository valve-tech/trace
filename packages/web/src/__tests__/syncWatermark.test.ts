import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Pure-helper tests for the address-scoped sync watermark. idb-keyval is
 * mocked with a Map so the helpers can be exercised in jsdom (no IDB) and
 * the on-disk shape is observable.
 */

const store = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  get: vi.fn(async <T,>(key: string) => store.get(key) as T | undefined),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import {
  loadWatermark,
  saveWatermark,
  _clearWatermarksForTests,
} from "../lib/workspace/syncWatermark";

const ADDR_A = "0xAbCdEf0000000000000000000000000000000001";
const ADDR_B = "0xfedcba0000000000000000000000000000000002";

beforeEach(() => {
  store.clear();
});

describe("syncWatermark — load defaults", () => {
  it("returns 0 when no entry exists for the address", async () => {
    expect(await loadWatermark(ADDR_A)).toBe(0);
  });

  it("returns 0 for an address not in an existing map", async () => {
    await saveWatermark(ADDR_A, 42);
    expect(await loadWatermark(ADDR_B)).toBe(0);
  });
});

describe("syncWatermark — save / load roundtrip", () => {
  it("persists and recalls a value for the same address", async () => {
    await saveWatermark(ADDR_A, 1234);
    expect(await loadWatermark(ADDR_A)).toBe(1234);
  });

  it("normalizes address case — load matches save regardless of casing", async () => {
    await saveWatermark(ADDR_A.toUpperCase(), 99);
    expect(await loadWatermark(ADDR_A.toLowerCase())).toBe(99);
    expect(await loadWatermark(ADDR_A)).toBe(99);
  });

  it("address-scoping: writing A does not affect B", async () => {
    await saveWatermark(ADDR_A, 100);
    await saveWatermark(ADDR_B, 200);
    expect(await loadWatermark(ADDR_A)).toBe(100);
    expect(await loadWatermark(ADDR_B)).toBe(200);
  });

  it("repeated saves overwrite (not append)", async () => {
    await saveWatermark(ADDR_A, 1);
    await saveWatermark(ADDR_A, 2);
    await saveWatermark(ADDR_A, 3);
    expect(await loadWatermark(ADDR_A)).toBe(3);
  });
});

describe("syncWatermark — _clearWatermarksForTests", () => {
  it("drops every entry", async () => {
    await saveWatermark(ADDR_A, 1);
    await saveWatermark(ADDR_B, 2);
    await _clearWatermarksForTests();
    expect(await loadWatermark(ADDR_A)).toBe(0);
    expect(await loadWatermark(ADDR_B)).toBe(0);
  });
});
