import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import * as sourceApi from "../api/source";
import { useTraceSources } from "../hooks/useTraceSources";
import { DEFAULT_CHAIN_ID } from "../lib/chains";

/**
 * Hook-level tests for `useTraceSources`. Mirrors useContractMeta tests for
 * the cache-pinning bug class: a transient upstream failure must not pin an
 * empty result forever under `staleTime: Infinity`, otherwise the call-tree
 * fnIndex stays empty for the rest of the session and the call-site override
 * has no data to operate on (the 2026-05-31 Bug 2 confirmation discovered
 * exactly this state).
 *
 * Approach: spy on `fetchTraceSourceFiles`, mount the hook in a controlled
 * QueryClient (in-memory only — no IndexedDB persister), inspect the cached
 * query's `isStale()` to verify the staleTime decision.
 */

const ADDR_A = "0xaaaa000000000000000000000000000000000000";
const ADDR_B = "0xbbbb000000000000000000000000000000000000";

const VERIFIED = (name: string): { files: sourceApi.SourceFile[]; verified: true } => ({
  files: [{ name: `${name}.sol`, content: `contract ${name} {}` }],
  verified: true,
});

const UNVERIFIED = (): { files: sourceApi.SourceFile[]; verified: false } => ({
  files: [],
  verified: false,
});

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, gcTime: Infinity, retry: false },
    },
  });
}

function findTraceSourcesQuery(client: QueryClient, addrs: string[]) {
  const key = addrs.map((a) => a.toLowerCase()).sort().join(",");
  return client
    .getQueryCache()
    .find({ queryKey: ["trace-sources", "v2", DEFAULT_CHAIN_ID, key] });
}

describe("useTraceSources — cache discipline", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("marks an all-verified result as fresh forever (isStale=false)", async () => {
    const client = makeQueryClient();
    const spy = vi
      .spyOn(sourceApi, "fetchTraceSourceFiles")
      .mockImplementation(async (a) =>
        a.toLowerCase() === ADDR_A ? VERIFIED("A") : VERIFIED("B"),
      );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>
    );
    const addrs = [ADDR_A, ADDR_B];

    const { result } = renderHook(() => useTraceSources(addrs), { wrapper });
    await waitFor(() => expect(result.current.data[ADDR_A]).toBeDefined());
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.current.data[ADDR_A]?.[0]?.name).toBe("A.sol");
    expect(result.current.data[ADDR_B]?.[0]?.name).toBe("B.sol");

    const query = findTraceSourcesQuery(client, addrs);
    expect(query!.isStale()).toBe(false);
  });

  it("marks an any-unverified result with a FINITE TTL (15 min), not Infinity", async () => {
    const client = makeQueryClient();
    vi.spyOn(sourceApi, "fetchTraceSourceFiles").mockImplementation(async (a) =>
      a.toLowerCase() === ADDR_A ? VERIFIED("A") : UNVERIFIED(),
    );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>
    );
    const addrs = [ADDR_A, ADDR_B];

    const { result } = renderHook(() => useTraceSources(addrs), { wrapper });
    await waitFor(() => expect(result.current.data[ADDR_A]).toBeDefined());

    const query = findTraceSourcesQuery(client, addrs);
    // Right now: still inside the TTL window, so not stale.
    expect(query!.isStale()).toBe(false);

    // Probe the staleTime resolver directly — for the any-unverified case it
    // must return a finite positive number (not Infinity, not 0). The exact
    // value is an implementation detail; we just pin the SHAPE.
    const opts = query!.options as {
      staleTime?: number | ((q: typeof query) => number);
    };
    const resolved =
      typeof opts.staleTime === "function"
        ? opts.staleTime(query!)
        : opts.staleTime;
    expect(resolved).toBeGreaterThan(0);
    expect(Number.isFinite(resolved)).toBe(true);
  });

  it("marks a SPARSE result (transient failure) stale immediately", async () => {
    const client = makeQueryClient();
    const spy = vi
      .spyOn(sourceApi, "fetchTraceSourceFiles")
      // ADDR_A: definitive verified; ADDR_B: transient failure → null.
      .mockImplementation(async (a) =>
        a.toLowerCase() === ADDR_A ? VERIFIED("A") : null,
      );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>
    );
    const addrs = [ADDR_A, ADDR_B];

    const { result } = renderHook(() => useTraceSources(addrs), { wrapper });
    await waitFor(() => expect(result.current.data[ADDR_A]).toBeDefined());
    expect(spy).toHaveBeenCalledTimes(2);
    // ADDR_B omitted — caller sees what we have so far.
    expect(result.current.data[ADDR_B]).toBeUndefined();

    const query = findTraceSourcesQuery(client, addrs);
    expect(query!.isStale()).toBe(true);
  });

  it("refetches a sparse query on remount and fills in the missing address", async () => {
    const client = makeQueryClient();
    let call = 0;
    vi.spyOn(sourceApi, "fetchTraceSourceFiles").mockImplementation(
      async (a) => {
        call += 1;
        // First sweep (calls 1+2): ADDR_B transient-fails.
        // Second sweep (calls 3+4): both succeed.
        if (call <= 2) {
          return a.toLowerCase() === ADDR_A ? VERIFIED("A") : null;
        }
        return a.toLowerCase() === ADDR_A ? VERIFIED("A") : VERIFIED("B");
      },
    );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>
    );
    const addrs = [ADDR_A, ADDR_B];

    const first = renderHook(() => useTraceSources(addrs), { wrapper });
    await waitFor(() => expect(first.result.current.data[ADDR_A]).toBeDefined());
    expect(first.result.current.data[ADDR_B]).toBeUndefined();
    first.unmount();

    const second = renderHook(() => useTraceSources(addrs), { wrapper });
    await waitFor(() =>
      expect(second.result.current.data[ADDR_B]).toBeDefined(),
    );
    expect(second.result.current.data[ADDR_A]?.[0]?.name).toBe("A.sol");
    expect(second.result.current.data[ADDR_B]?.[0]?.name).toBe("B.sol");

    const query = findTraceSourcesQuery(client, addrs);
    expect(query!.isStale()).toBe(false);
  });

  it("serves a complete-verified result from cache on remount (no extra fetch)", async () => {
    const client = makeQueryClient();
    const spy = vi
      .spyOn(sourceApi, "fetchTraceSourceFiles")
      .mockImplementation(async () => VERIFIED("X"));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>
    );
    const addrs = [ADDR_A, ADDR_B];

    const first = renderHook(() => useTraceSources(addrs), { wrapper });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    first.unmount();

    renderHook(() => useTraceSources(addrs), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    // Complete + all verified → cached forever, no refetch.
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not fetch when addresses array is empty", async () => {
    const client = makeQueryClient();
    const spy = vi.spyOn(sourceApi, "fetchTraceSourceFiles");

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>
    );

    const { result } = renderHook(() => useTraceSources([]), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(spy).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({});
  });

  it("treats address order as irrelevant for the cache key (sort stable)", async () => {
    const client = makeQueryClient();
    const spy = vi
      .spyOn(sourceApi, "fetchTraceSourceFiles")
      .mockImplementation(async () => VERIFIED("X"));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>
    );

    renderHook(() => useTraceSources([ADDR_A, ADDR_B]), { wrapper });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    renderHook(() => useTraceSources([ADDR_B, ADDR_A]), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("exposes a refetch handle that forces a re-check", async () => {
    const client = makeQueryClient();
    let call = 0;
    vi.spyOn(sourceApi, "fetchTraceSourceFiles").mockImplementation(async () => {
      call += 1;
      // First sweep: unverified. Second sweep (after refetch): verified —
      // simulating a freshly-verified contract picked up via the "re-check"
      // affordance.
      return call <= 2 ? UNVERIFIED() : VERIFIED("X");
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>
    );
    const addrs = [ADDR_A, ADDR_B];

    const { result } = renderHook(() => useTraceSources(addrs), { wrapper });
    await waitFor(() => expect(result.current.data[ADDR_A]).toBeDefined());
    expect(result.current.data[ADDR_A]).toEqual([]); // unverified yet

    await result.current.refetch();
    await waitFor(() =>
      expect(result.current.data[ADDR_A]?.[0]?.name).toBe("X.sol"),
    );
  });
});
