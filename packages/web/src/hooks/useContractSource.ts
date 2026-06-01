import { useQuery } from "@tanstack/react-query";
import {
  fetchContractSourceWithRetry,
  fetchTraceSourceMap,
  type ContractSource,
  type SourceLocation,
} from "../api/source";

const UNVERIFIED_TTL_MS = 15 * 60 * 1000;

/**
 * Fetch the verified ContractSource for a single address. Two changes over
 * the v1 shape:
 *
 *   1. The queryFn now distinguishes verified / definitively-unverified /
 *      transient. v1 collapsed transient → null and pinned it under
 *      `staleTime: Infinity` — the verified contract panel would stay blank
 *      forever after a single backend hiccup. v2 throws on transient (so
 *      React Query keeps data undefined and re-fetches on the next mount).
 *
 *   2. Definitively-unverified contracts cache with a 15min TTL, not ∞ —
 *      a contract can be verified upstream later.
 */
export function useContractSource(address: string | null | undefined) {
  const addrKey = address?.toLowerCase();
  return useQuery({
    queryKey: ["source", "v2", addrKey],
    queryFn: async (): Promise<ContractSource | null> =>
      fetchContractSourceWithRetry(address!),
    enabled: !!address,
    staleTime: (q) => (q.state.data === null ? UNVERIFIED_TTL_MS : Infinity),
  });
}

type SourceMap = Record<number, SourceLocation | null>;

/**
 * Fetch source-map mappings for a contract's PC set. v1 returned `{}` for
 * both "unmappable" and "transient" and cached the result ∞ — a single
 * backend hiccup pinned an empty map forever, silently disabling
 * step↔source navigation in the debugger. v2 throws on transient so
 * React Query keeps data undefined and re-runs on next mount; unmappable
 * (404) caches with a 15min TTL.
 */
export function useSourceMappings(
  address: string | null | undefined,
  pcs: number[],
) {
  // Sorted copy so two callers with equal-length but differently-ordered
  // PCs share one cache entry. Sort doesn't mutate the input.
  const sortedPcs = [...pcs].sort((a, b) => a - b);
  const addrKey = address?.toLowerCase();

  return useQuery({
    queryKey: ["source-map", "v2", addrKey, sortedPcs],
    queryFn: async (): Promise<SourceMap> => {
      const result = await fetchTraceSourceMap(address!, pcs);
      // null = transient/fatal after retry budget exhausted. Throw so
      // React Query stores no data and re-runs on the next mount.
      if (!result) throw new Error("source-map fetch failed after retries");
      return result.mappings;
    },
    enabled: !!address && pcs.length > 0,
    staleTime: (q) => {
      const data = q.state.data;
      if (data === undefined) return 0; // pre-resolve
      // An empty map is the unmappable signal — TTL it. A non-empty map
      // is the verified mapped result — canonical, cache ∞.
      return Object.keys(data).length === 0 ? UNVERIFIED_TTL_MS : Infinity;
    },
  });
}
