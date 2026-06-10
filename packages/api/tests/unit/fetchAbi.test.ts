import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Abi } from "viem";
import { fetchAbi, type FetchAbiDeps } from "../../src/services/decoder/fetchAbi.js";
import { invalidateAbiCache } from "../../src/services/decoder/abiCache.js";
import type { VerifiedSource } from "../../src/services/sourceCode.js";

/**
 * Unit tests for the verified-ABI fetcher. The function rides
 * getVerifiedSource (Sourcify-first, injected via the deps seam here) and
 * carries three load-bearing behaviors:
 *
 *   1. Cache short-circuit (no lookup on hit)
 *   2. In-flight coalescing (concurrent callers share one lookup)
 *   3. Defensive null returns for every failure mode (unverified, empty
 *      ABI, UpstreamError throw)
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

function verifiedSource(abi: unknown[]): VerifiedSource {
  return {
    address: ADDR,
    chainSource: "sourcify",
    contractName: "Token",
    compilerVersion: "0.8.20",
    optimizationUsed: false,
    optimizationRuns: null,
    sourceFiles: [],
    abi,
    sourceMap: null,
    deployedBytecode: null,
  };
}

function countingDeps(
  impl: (address: string) => Promise<VerifiedSource | null>,
): FetchAbiDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getVerifiedSource: async (address: string) => {
      calls.push(address);
      return impl(address);
    },
  };
}

beforeEach(() => {
  invalidateAbiCache();
});

describe("fetchAbi", () => {
  it("returns the ABI from the verified source", async () => {
    const deps = countingDeps(async () => verifiedSource(SAMPLE_ABI as unknown[]));
    const out = await fetchAbi(ADDR, deps);
    assert.deepEqual(out, SAMPLE_ABI);
    assert.equal(deps.calls.length, 1);
  });

  it("normalizes the address to lowercase for the cache key", async () => {
    // First call (lowercase) populates the cache; second call (uppercase
    // input, same address) should hit the cache and NOT trigger a lookup.
    const deps = countingDeps(async () => verifiedSource(SAMPLE_ABI as unknown[]));
    await fetchAbi(ADDR.toLowerCase(), deps);
    await fetchAbi(ADDR.toUpperCase(), deps);
    assert.equal(deps.calls.length, 1);
  });

  it("returns null for an unverified contract (source resolves null)", async () => {
    const deps = countingDeps(async () => null);
    assert.equal(await fetchAbi(ADDR, deps), null);
  });

  it("returns null for a verified contract with an empty ABI", async () => {
    const deps = countingDeps(async () => verifiedSource([]));
    assert.equal(await fetchAbi(ADDR, deps), null);
  });

  it("returns null when the lookup throws (both upstreams down)", async () => {
    const deps = countingDeps(async () => {
      throw new Error("verification upstreams unavailable");
    });
    assert.equal(await fetchAbi(ADDR, deps), null);
  });

  it("caches a successful response — second call uses the cache, no lookup", async () => {
    const deps = countingDeps(async () => verifiedSource(SAMPLE_ABI as unknown[]));
    await fetchAbi(ADDR, deps);
    await fetchAbi(ADDR, deps);
    assert.equal(deps.calls.length, 1);
  });

  it("does NOT cache a null result — every call refetches the unverified address", async () => {
    // Operators frequently re-verify previously-unverified contracts;
    // caching the null result here would strand them as unverified for the
    // TTL window. (getVerifiedSource has its own short negative cache.)
    const deps = countingDeps(async () => null);
    await fetchAbi(ADDR, deps);
    await fetchAbi(ADDR, deps);
    assert.equal(deps.calls.length, 2);
  });

  it("coalesces concurrent callers — N parallel calls trigger ONE lookup", async () => {
    // The in-flight map dedupe: when the gas profiler walks a call tree
    // in parallel and fires 50 lookups for the same address at once,
    // only the first resolves the source; the others await its promise.
    const deps = countingDeps(async () => {
      // Small await so the promise hasn't settled before the second
      // call enters the function.
      await new Promise((r) => setTimeout(r, 5));
      return verifiedSource(SAMPLE_ABI as unknown[]);
    });
    const results = await Promise.all([
      fetchAbi(ADDR, deps),
      fetchAbi(ADDR, deps),
      fetchAbi(ADDR, deps),
      fetchAbi(ADDR, deps),
    ]);
    assert.equal(deps.calls.length, 1);
    for (const r of results) assert.deepEqual(r, SAMPLE_ABI);
  });
});
