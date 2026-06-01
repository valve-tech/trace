import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as sourceApi from "../api/source";
import { useSourceMappings } from "../hooks/useContractSource";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useSourceMappings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("re-fetches when the PC set changes content but not length", async () => {
    // v2 of useSourceMappings calls fetchTraceSourceMap (which wraps
    // attemptFetchSourceMap with retry-then-throw semantics).
    const spy = vi
      .spyOn(sourceApi, "fetchTraceSourceMap")
      .mockResolvedValue({ mappings: {}, mapped: true });
    const wrapper = makeWrapper();
    const addr = "0xaaaa000000000000000000000000000000000000";

    const { rerender } = renderHook(
      ({ pcs }: { pcs: number[] }) => useSourceMappings(addr, pcs),
      { wrapper, initialProps: { pcs: [1, 2, 3] } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenLastCalledWith(addr, [1, 2, 3]);

    rerender({ pcs: [4, 5, 6] });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenLastCalledWith(addr, [4, 5, 6]);
  });

  it("dedupes when the PC set is the same content in different order", async () => {
    // v2 of useSourceMappings calls fetchTraceSourceMap (which wraps
    // attemptFetchSourceMap with retry-then-throw semantics).
    const spy = vi
      .spyOn(sourceApi, "fetchTraceSourceMap")
      .mockResolvedValue({ mappings: {}, mapped: true });
    const wrapper = makeWrapper();
    const addr = "0xbbbb000000000000000000000000000000000000";

    const { rerender } = renderHook(
      ({ pcs }: { pcs: number[] }) => useSourceMappings(addr, pcs),
      { wrapper, initialProps: { pcs: [1, 2, 3] } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ pcs: [3, 2, 1] });
    // Give react-query a chance to issue a second fetch if it were going to
    await new Promise((r) => setTimeout(r, 50));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
