import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as sigApi from "../api/signatures";
import { useSignatures } from "../hooks/useSignatures";

/**
 * Hook-level tests for `useSignatures`. The cache-discipline guarantee here
 * is that a transient batch failure (network/5xx → fetchSignaturesBatch
 * returns null) must NOT pin an empty result forever — the queryFn throws,
 * so React Query stores no data and re-fetches on the next mount.
 *
 * Separately verify that an HTTP-200 result that resolves with NO matches
 * for a selector IS cached as-is (the backend's 1h negative cache is the
 * authoritative source for negative matches).
 */

const SEL_A = "0xa0b1c2d3";
const SEL_B = "0xdeadbeef";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, gcTime: Infinity, retry: false },
    },
  });
}

describe("useSignatures — cache discipline", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("caches a successful batch (including selectors with no match) forever", async () => {
    const client = makeQueryClient();
    const spy = vi
      .spyOn(sigApi, "fetchSignaturesBatch")
      .mockResolvedValue({
        results: {
          [SEL_A]: [
            { selector: SEL_A, textSignature: "transfer(address,uint256)", sigType: "function" },
          ],
          [SEL_B]: [], // backend says: definitively no match for this selector
        },
      });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSignatures([SEL_A, SEL_B]), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.data![SEL_A]?.[0]?.textSignature).toBe(
      "transfer(address,uint256)",
    );
    expect(result.current.data![SEL_B]).toEqual([]);

    // Remount: should hit cache, no extra fetch.
    renderHook(() => useSignatures([SEL_A, SEL_B]), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does NOT cache when fetchSignaturesBatch returns null (transient)", async () => {
    const client = makeQueryClient();
    const spy = vi.spyOn(sigApi, "fetchSignaturesBatch").mockResolvedValue(null);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result, unmount } = renderHook(() => useSignatures([SEL_A]), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    unmount();

    // Recover: backend returns a real answer the second time.
    spy.mockResolvedValueOnce({
      results: { [SEL_A]: [{ selector: SEL_A, textSignature: "approve(address,uint256)", sigType: "function" }] },
    });

    const second = renderHook(() => useSignatures([SEL_A]), { wrapper });
    await waitFor(() => expect(second.result.current.data).toBeDefined());
    expect(second.result.current.data![SEL_A]?.[0]?.textSignature).toBe(
      "approve(address,uint256)",
    );
  });

  it("does not fetch when selectors array is empty", async () => {
    const client = makeQueryClient();
    const spy = vi.spyOn(sigApi, "fetchSignaturesBatch");

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSignatures([]), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(spy).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
