import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Abi } from "viem";
import { fetchAbi } from "../../src/services/decoder/fetchAbi.js";
import { invalidateAbiCache } from "../../src/services/decoder/abiCache.js";

/**
 * Unit tests for the verified-ABI fetcher. The function is small but
 * carries three load-bearing behaviors:
 *
 *   1. Cache short-circuit (no HTTP on hit)
 *   2. In-flight coalescing (concurrent callers share one fetch)
 *   3. Defensive null returns for every upstream failure mode
 *      (non-2xx, non-"1" status, malformed JSON, timeout, network)
 *
 * Tests stub globalThis.fetch and assert both behavior and call counts.
 */

const ADDR = "0x" + "ab".repeat(20);
const SAMPLE_ABI: Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

interface FetchStub {
  calls: string[];
  restore: () => void;
}

function stubFetch(
  impl: (url: string) => Promise<Partial<Response>>,
): FetchStub {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const res = await impl(url);
    return res as Response;
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

beforeEach(() => {
  invalidateAbiCache();
});

let stub: FetchStub | null = null;
afterEach(() => {
  stub?.restore();
  stub = null;
});

describe("fetchAbi", () => {
  it("returns the parsed ABI on a 'status: 1' upstream response", async () => {
    stub = stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "1",
        message: "OK",
        result: JSON.stringify(SAMPLE_ABI),
      }),
    }));
    const out = await fetchAbi(ADDR);
    assert.deepEqual(out, SAMPLE_ABI);
    assert.equal(stub.calls.length, 1);
    assert.match(stub.calls[0]!, /module=contract&action=getabi/);
  });

  it("normalizes the address to lowercase for the cache key", async () => {
    // First call (lowercase) populates the cache; second call (uppercase
    // input, same address) should hit the cache and NOT trigger a fetch.
    stub = stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "1",
        result: JSON.stringify(SAMPLE_ABI),
      }),
    }));
    await fetchAbi(ADDR.toLowerCase());
    await fetchAbi(ADDR.toUpperCase());
    assert.equal(stub.calls.length, 1);
  });

  it("returns null when the upstream returns a non-2xx response", async () => {
    stub = stubFetch(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    assert.equal(await fetchAbi(ADDR), null);
  });

  it("returns null when status is not '1' (Blockscout's 'not verified' reply)", async () => {
    stub = stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "0",
        message: "NOTOK",
        result: "Contract source code not verified",
      }),
    }));
    assert.equal(await fetchAbi(ADDR), null);
  });

  it("returns null when result is not a string (malformed envelope)", async () => {
    stub = stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "1", result: { not: "a string" } }),
    }));
    assert.equal(await fetchAbi(ADDR), null);
  });

  it("returns null when the result string isn't valid JSON", async () => {
    stub = stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "1", result: "not-json" }),
    }));
    assert.equal(await fetchAbi(ADDR), null);
  });

  it("returns null when the fetch itself throws (timeout, network)", async () => {
    stub = stubFetch(async () => {
      throw new Error("network error");
    });
    assert.equal(await fetchAbi(ADDR), null);
  });

  it("caches a successful response — second call uses the cache, no fetch", async () => {
    let callCount = 0;
    stub = stubFetch(async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "1",
          result: JSON.stringify(SAMPLE_ABI),
        }),
      };
    });
    await fetchAbi(ADDR);
    await fetchAbi(ADDR);
    assert.equal(callCount, 1);
  });

  it("does NOT cache a null result — every call refetches the unverified address", async () => {
    // Operators frequently re-verify previously-unverified contracts;
    // caching the null result would strand them as unverified for the
    // TTL window. Negative caching is intentionally absent.
    let callCount = 0;
    stub = stubFetch(async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "0",
          result: "Contract source code not verified",
        }),
      };
    });
    await fetchAbi(ADDR);
    await fetchAbi(ADDR);
    assert.equal(callCount, 2);
  });

  it("coalesces concurrent callers — N parallel calls trigger ONE fetch", async () => {
    // The in-flight map dedupe: when the gas profiler walks a call tree
    // in parallel and fires 50 lookups for the same address at once,
    // only the first hits the network; the others await its promise.
    let callCount = 0;
    stub = stubFetch(async () => {
      callCount++;
      // Small await so the promise hasn't settled before the second
      // call enters the function.
      await new Promise((r) => setTimeout(r, 5));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "1",
          result: JSON.stringify(SAMPLE_ABI),
        }),
      };
    });
    const results = await Promise.all([
      fetchAbi(ADDR),
      fetchAbi(ADDR),
      fetchAbi(ADDR),
      fetchAbi(ADDR),
    ]);
    assert.equal(callCount, 1);
    for (const r of results) assert.deepEqual(r, SAMPLE_ABI);
  });
});
