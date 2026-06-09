import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * tokenMeta is the watcher's single effectful read (decimals/symbol). We mock
 * the viem client factory it rides on so the memoization + failure-eviction
 * logic can be exercised without an RPC: assert it reads a token once, treats
 * symbol() as optional, and does NOT cache a failed decimals() read.
 */

const readContract = vi.fn();

vi.mock("../lib/watcher/client", () => ({
  getPublicClient: () => ({ readContract }),
}));

import { getTokenMeta, resetTokenMeta } from "../lib/watcher/tokenMeta";

const TOKEN = "0xAbC0000000000000000000000000000000000001"; // mixed case

beforeEach(() => {
  resetTokenMeta();
  readContract.mockReset();
});

describe("watcher/tokenMeta", () => {
  it("reads decimals + symbol once and memoizes per (chain, token)", async () => {
    readContract.mockImplementation(
      async ({ functionName }: { functionName: string }) =>
        functionName === "decimals" ? 6 : "USDC",
    );

    const a = await getTokenMeta(369, TOKEN);
    const b = await getTokenMeta(369, TOKEN.toLowerCase()); // same token, normalized

    expect(a).toEqual({ decimals: 6, symbol: "USDC" });
    expect(b).toBe(a); // same memoized promise resolution
    expect(readContract).toHaveBeenCalledTimes(2); // decimals + symbol, once
  });

  it("keys the cache by chain — same token on two chains reads twice", async () => {
    readContract.mockImplementation(
      async ({ functionName }: { functionName: string }) =>
        functionName === "decimals" ? 18 : "WPLS",
    );

    await getTokenMeta(1, TOKEN);
    await getTokenMeta(369, TOKEN);

    expect(readContract).toHaveBeenCalledTimes(4); // (decimals+symbol) per chain
  });

  it("returns decimals with no symbol when symbol() reverts", async () => {
    readContract.mockImplementation(
      async ({ functionName }: { functionName: string }) => {
        if (functionName === "decimals") return 18;
        throw new Error("symbol() not implemented");
      },
    );

    expect(await getTokenMeta(1, TOKEN)).toEqual({
      decimals: 18,
      symbol: undefined,
    });
  });

  it("coerces an empty symbol string to undefined", async () => {
    readContract.mockImplementation(
      async ({ functionName }: { functionName: string }) =>
        functionName === "decimals" ? 8 : "",
    );

    expect(await getTokenMeta(1, TOKEN)).toEqual({
      decimals: 8,
      symbol: undefined,
    });
  });

  it("returns null and does NOT cache a failed decimals() read", async () => {
    readContract.mockRejectedValueOnce(new Error("rpc down"));
    expect(await getTokenMeta(1, TOKEN)).toBeNull();

    // Cache was evicted, so the next transfer of the same token retries.
    readContract.mockImplementation(
      async ({ functionName }: { functionName: string }) =>
        functionName === "decimals" ? 8 : "OK",
    );
    expect(await getTokenMeta(1, TOKEN)).toEqual({ decimals: 8, symbol: "OK" });
  });
});
