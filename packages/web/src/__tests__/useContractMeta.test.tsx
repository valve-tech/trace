import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as contractMetaApi from "../api/contractMeta";
import { useContractMeta } from "../hooks/useContractMeta";

/**
 * Hook-level tests for `useContractMeta`. The cache-pinning bug fixed in
 * a0c9f80 lived *between* `resolveContractMeta` and the `useQuery` wrapper —
 * specifically in the conditional-`staleTime` behavior that decides whether
 * a sparse result is treated as canonical or as "we don't know yet, ask
 * again on the next mount."
 *
 * Phase 1 (etherscanInvariants.test.ts) covers the boundary between the
 * fetcher and the envelope. This file covers the boundary between the
 * fetcher and React Query. Together they nail down the silent-absorb
 * pattern from both sides.
 *
 * Approach: spy on `resolveContractMeta`, mount the hook in a controlled
 * QueryClient (real one, in-memory only — no IndexedDB persister), then
 * inspect the cached query's `isStale()` to verify the staleTime decision.
 */

const ADDR_A = "0xaaaa000000000000000000000000000000000000";
const ADDR_B = "0xbbbb000000000000000000000000000000000000";

function fullMeta(name: string): contractMetaApi.ContractMeta {
  return { name, selectors: {}, events: {} };
}

/** Mirrors the prod default-options shape so isStale() behaves like prod. */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
      },
    },
  });
}

function findContractMetaQuery(client: QueryClient, addrs: string[]) {
  const key = addrs.map((a) => a.toLowerCase()).sort().join(",");
  return client
    .getQueryCache()
    .find({ queryKey: ["contract-meta", "v3", key] });
}

describe("useContractMeta — cache discipline", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks a COMPLETE result as fresh forever (isStale=false)", async () => {
    const client = makeQueryClient();
    const spy = vi
      .spyOn(contractMetaApi, "resolveContractMeta")
      .mockResolvedValue({
        [ADDR_A]: fullMeta("ContractA"),
        [ADDR_B]: fullMeta("ContractB"),
      });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const addrs = [ADDR_A, ADDR_B];

    const { result } = renderHook(() => useContractMeta(addrs), { wrapper });
    await waitFor(() =>
      expect(result.current.names[ADDR_A]).toBe("ContractA"),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.names[ADDR_B]).toBe("ContractB");

    // Complete result → not stale.
    const query = findContractMetaQuery(client, addrs);
    expect(query).toBeDefined();
    expect(query!.isStale()).toBe(false);
  });

  it("marks a SPARSE result as stale immediately (isStale=true)", async () => {
    const client = makeQueryClient();
    const spy = vi
      .spyOn(contractMetaApi, "resolveContractMeta")
      .mockResolvedValue({
        [ADDR_A]: fullMeta("ContractA"),
        // ADDR_B intentionally omitted — simulating a transient upstream
        // failure for ADDR_B after the retry budget exhausted.
      });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const addrs = [ADDR_A, ADDR_B];

    const { result } = renderHook(() => useContractMeta(addrs), { wrapper });
    // Partial result is still returned to the caller — the user sees what we
    // have, just doesn't see ADDR_B yet.
    await waitFor(() =>
      expect(result.current.names[ADDR_A]).toBe("ContractA"),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.names[ADDR_B]).toBeUndefined();

    // Sparse result → stale immediately.
    const query = findContractMetaQuery(client, addrs);
    expect(query).toBeDefined();
    expect(query!.isStale()).toBe(true);
  });

  it("refetches a sparse query on remount with the same QueryClient", async () => {
    const client = makeQueryClient();
    const spy = vi
      .spyOn(contractMetaApi, "resolveContractMeta")
      // First call: ADDR_B missing (transient failure).
      .mockResolvedValueOnce({ [ADDR_A]: fullMeta("ContractA") })
      // Second call: upstream recovered, both resolve.
      .mockResolvedValueOnce({
        [ADDR_A]: fullMeta("ContractA"),
        [ADDR_B]: fullMeta("ContractB"),
      });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const addrs = [ADDR_A, ADDR_B];

    // First mount — sparse result.
    const first = renderHook(() => useContractMeta(addrs), { wrapper });
    await waitFor(() =>
      expect(first.result.current.names[ADDR_A]).toBe("ContractA"),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(first.result.current.names[ADDR_B]).toBeUndefined();
    first.unmount();

    // Second mount with the SAME QueryClient — because the prior result was
    // sparse and therefore stale, the hook re-runs the queryFn instead of
    // serving from cache. This is the exact behavior the bug from a0c9f80
    // was missing: a sparse result that re-mounts MUST retry the upstream.
    const second = renderHook(() => useContractMeta(addrs), { wrapper });
    await waitFor(() =>
      expect(second.result.current.names[ADDR_B]).toBe("ContractB"),
    );
    expect(spy).toHaveBeenCalledTimes(2);
    expect(second.result.current.names[ADDR_A]).toBe("ContractA");

    // Now the complete result is cached → not stale.
    const query = findContractMetaQuery(client, addrs);
    expect(query!.isStale()).toBe(false);
  });

  it("serves a complete result from cache on remount (no extra fetch)", async () => {
    const client = makeQueryClient();
    const spy = vi
      .spyOn(contractMetaApi, "resolveContractMeta")
      .mockResolvedValue({
        [ADDR_A]: fullMeta("ContractA"),
        [ADDR_B]: fullMeta("ContractB"),
      });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const addrs = [ADDR_A, ADDR_B];

    const first = renderHook(() => useContractMeta(addrs), { wrapper });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    first.unmount();

    // Remount with the same client — complete result was cached, fetch
    // does NOT fire again.
    renderHook(() => useContractMeta(addrs), { wrapper });
    // Give react-query a chance to issue a stray refetch if it were going to.
    await new Promise((r) => setTimeout(r, 30));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when addresses array is empty", async () => {
    const client = makeQueryClient();
    const spy = vi.spyOn(contractMetaApi, "resolveContractMeta");

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useContractMeta([]), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(spy).not.toHaveBeenCalled();
    expect(result.current.names).toEqual({});
    expect(result.current.abiSelectors).toEqual({});
    expect(result.current.eventTopics).toEqual({});
  });

  it("treats address order as irrelevant for cache key (sort stable)", async () => {
    const client = makeQueryClient();
    const spy = vi
      .spyOn(contractMetaApi, "resolveContractMeta")
      .mockResolvedValue({
        [ADDR_A]: fullMeta("ContractA"),
        [ADDR_B]: fullMeta("ContractB"),
      });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    renderHook(() => useContractMeta([ADDR_A, ADDR_B]), { wrapper });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    // Same addresses, reverse order — must hit the same cache entry.
    renderHook(() => useContractMeta([ADDR_B, ADDR_A]), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
