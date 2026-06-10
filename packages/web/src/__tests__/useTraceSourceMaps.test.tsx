import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import * as sourceApi from "../api/source";
import { DEFAULT_CHAIN_ID } from "../lib/chains";
import { useTraceSourceMaps } from "../hooks/useTraceSourceMaps";

/**
 * Hook-level tests for `useTraceSourceMaps`. Same cache-discipline shape as
 * useTraceSources / useContractMeta: a transient backend failure must NOT
 * pin an empty mapping forever under `staleTime: Infinity`, otherwise the
 * InternalCallTree silently runs without source maps for the rest of the
 * session and step↔source navigation breaks across reloads.
 */

const ADDR_A = "0xaaaa000000000000000000000000000000000000";
const ADDR_B = "0xbbbb000000000000000000000000000000000000";

const MAPPED = (pc: number, line: number): { mappings: Record<number, sourceApi.SourceLocation | null>; mapped: true } => ({
  mappings: {
    [pc]: {
      file: "Foo.sol",
      line,
      column: 0,
      endLine: line,
      endColumn: 10,
      sourceSnippet: "function foo() {}",
      jumpType: "-",
    },
  },
  mapped: true,
});

const UNMAPPABLE = (): { mappings: Record<number, sourceApi.SourceLocation | null>; mapped: false } => ({
  mappings: {},
  mapped: false,
});

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, gcTime: Infinity, retry: false },
    },
  });
}

function findQuery(client: QueryClient, addrs: string[], pcsByContract: Record<string, number[]>) {
  const key = addrs.map((a) => `${a}:${pcsByContract[a]!.length}`).join(",");
  return client.getQueryCache().find({ queryKey: ["trace-source-maps", "v2", DEFAULT_CHAIN_ID, key] });
}

describe("useTraceSourceMaps — cache discipline", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("marks an all-mapped result as fresh forever", async () => {
    const client = makeQueryClient();
    vi.spyOn(sourceApi, "fetchTraceSourceMap").mockImplementation(async (a) =>
      a.toLowerCase() === ADDR_A ? MAPPED(10, 1) : MAPPED(20, 2),
    );
    const pcsByContract = { [ADDR_A]: [10], [ADDR_B]: [20] };
    const sortedAddrs = [ADDR_A, ADDR_B].sort();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>
    );

    const { result } = renderHook(() => useTraceSourceMaps(pcsByContract), { wrapper });
    await waitFor(() => expect(result.current.data[ADDR_A]).toBeDefined());

    const q = findQuery(client, sortedAddrs, pcsByContract);
    expect(q!.isStale()).toBe(false);
  });

  it("marks an any-unmappable result with a FINITE TTL", async () => {
    const client = makeQueryClient();
    vi.spyOn(sourceApi, "fetchTraceSourceMap").mockImplementation(async (a) =>
      a.toLowerCase() === ADDR_A ? MAPPED(10, 1) : UNMAPPABLE(),
    );
    const pcsByContract = { [ADDR_A]: [10], [ADDR_B]: [20] };
    const sortedAddrs = [ADDR_A, ADDR_B].sort();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>
    );
    const { result } = renderHook(() => useTraceSourceMaps(pcsByContract), { wrapper });
    await waitFor(() => expect(result.current.data[ADDR_A]).toBeDefined());

    const q = findQuery(client, sortedAddrs, pcsByContract)!;
    // Probe the staleTime resolver directly: any-unmappable must return a
    // finite positive number (TTL'd), not Infinity (would pin forever).
    const opts = q.options as {
      staleTime?: number | ((q: NonNullable<ReturnType<typeof findQuery>>) => number);
    };
    const resolved = typeof opts.staleTime === "function"
      ? opts.staleTime(q)
      : opts.staleTime;
    expect(resolved).toBeGreaterThan(0);
    expect(Number.isFinite(resolved)).toBe(true);
  });

  it("marks a SPARSE result (transient failure) stale immediately", async () => {
    const client = makeQueryClient();
    vi.spyOn(sourceApi, "fetchTraceSourceMap").mockImplementation(async (a) =>
      a.toLowerCase() === ADDR_A ? MAPPED(10, 1) : null,
    );
    const pcsByContract = { [ADDR_A]: [10], [ADDR_B]: [20] };
    const sortedAddrs = [ADDR_A, ADDR_B].sort();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>
    );
    const { result } = renderHook(() => useTraceSourceMaps(pcsByContract), { wrapper });
    await waitFor(() => expect(result.current.data[ADDR_A]).toBeDefined());
    // ADDR_B omitted — caller sees the partial result.
    expect(result.current.data[ADDR_B]).toBeUndefined();

    const q = findQuery(client, sortedAddrs, pcsByContract);
    expect(q!.isStale()).toBe(true);
  });

  it("refetches a sparse query on remount and fills in the missing contract", async () => {
    const client = makeQueryClient();
    let call = 0;
    vi.spyOn(sourceApi, "fetchTraceSourceMap").mockImplementation(async (a) => {
      call += 1;
      // First sweep (calls 1+2): ADDR_B transient-fails (null).
      // Second sweep (calls 3+4): both mapped.
      if (call <= 2) {
        return a.toLowerCase() === ADDR_A ? MAPPED(10, 1) : null;
      }
      return a.toLowerCase() === ADDR_A ? MAPPED(10, 1) : MAPPED(20, 2);
    });
    const pcsByContract = { [ADDR_A]: [10], [ADDR_B]: [20] };
    const sortedAddrs = [ADDR_A, ADDR_B].sort();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>
    );
    const first = renderHook(() => useTraceSourceMaps(pcsByContract), { wrapper });
    await waitFor(() => expect(first.result.current.data[ADDR_A]).toBeDefined());
    expect(first.result.current.data[ADDR_B]).toBeUndefined();
    first.unmount();

    const second = renderHook(() => useTraceSourceMaps(pcsByContract), { wrapper });
    await waitFor(() => expect(second.result.current.data[ADDR_B]).toBeDefined());

    const q = findQuery(client, sortedAddrs, pcsByContract);
    expect(q!.isStale()).toBe(false);
  });
});
