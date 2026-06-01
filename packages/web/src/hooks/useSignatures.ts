import { useQuery } from "@tanstack/react-query";
import { fetchSignaturesBatch, type SignatureMatch } from "../api/signatures";

/**
 * Resolve a batch of 4-byte selectors to their text signatures (function
 * names + types). Fix over the v1 shape:
 *
 * The previous version returned `{}` on transient backend failure (network,
 * 5xx, or backend ok:false) and that result got pinned under our global
 * `staleTime: Infinity` in IndexedDB. Because the backend already has its
 * own 1h negative cache, a single 4byte/Sourcify hiccup during a session
 * could end up pinning empty matches for every selector in a trace —
 * permanently — across reloads.
 *
 * v2 returns a definitive result when the backend gives one OR `undefined`
 * (via retry-then-omit) on persistent transient failure. Sparse results
 * have staleTime: 0 so the next mount re-runs the lookup.
 *
 * Note: the backend's own negative cache already differentiates "no match"
 * from "upstream down" within a 1h window, so we don't need a per-selector
 * TTL on the frontend — a successful HTTP response is canonical.
 */
export function useSignatures(selectors: string[]) {
  const key = [...selectors].map((s) => s.toLowerCase()).sort().join(",");

  const query = useQuery({
    // `v2` busts persisted caches from the pre-retry shape. Old v1 entries
    // held `{}` from sessions that hit a 4byte outage.
    queryKey: ["signatures", "v2", key],
    enabled: selectors.length > 0,
    queryFn: async (): Promise<Record<string, SignatureMatch[]>> => {
      const result = await fetchSignaturesBatch(selectors);
      // Throw on transient: keeps `data` undefined so the cache stores
      // nothing, and the next mount re-runs the fetch. (queryFn returning
      // undefined throws in TanStack v5 — we want the equivalent "no data
      // resolved" outcome instead.)
      if (!result) throw new Error("signatures batch failed after retries");
      return result.results;
    },
  });

  return query;
}
