import { useQuery } from "@tanstack/react-query";
import { fetchTraceSourceFiles, type SourceFile } from "../api/source";

/**
 * Fetch the source FILES for every contract in the trace, keyed by lower-cased
 * address. Parallels useTraceSourceMaps (which fetches pc→location maps): this
 * gives the call tree the raw source it needs to name internal functions
 * exactly and tell library calls apart from a contract's own internals.
 *
 * Cache discipline (mirrors useContractMeta, see contractMeta.ts). Without it,
 * an early transient API failure (5xx, ECONNRESET, an API restart mid-fetch)
 * would persist an empty-sources result forever under our `staleTime: Infinity`
 * defaults — silently breaking the call-tree fnIndex for every subsequent
 * session on that contract. The 2026-05-31 Bug 2 confirmation pass hit this
 * exactly: the call-site override appeared broken but was actually starved of
 * a fnIndex by a poisoned cache.
 *
 *   - All addresses resolved AND every entry is `verified`  → cache forever.
 *   - All addresses resolved BUT any entry is `unverified` → cache for
 *     UNVERIFIED_TTL_MS (15 min), so a freshly-verified contract gets picked
 *     up automatically without a hard refresh.
 *   - Any address omitted from the result (transient failure exhausted the
 *     per-address retry budget) → stale immediately, refetch on next mount.
 *
 * The hook also returns a `refetch` handle so a UI affordance ("re-check
 * verification") can force a refetch before the TTL expires — and exposes the
 * same handle on `window.__traceNav.refetchSources` in dev for console-driven
 * audits.
 */

const UNVERIFIED_TTL_MS = 15 * 60 * 1000;

interface TraceSourceEntry {
  files: SourceFile[];
  verified: boolean;
}

export function useTraceSources(addrs: string[]): {
  data: Record<string, SourceFile[]>;
  refetch: () => Promise<unknown>;
} {
  const key = [...addrs].map((a) => a.toLowerCase()).sort().join(",");
  const lowerAddresses = addrs.map((a) => a.toLowerCase());

  const query = useQuery({
    // `v2` busts persisted v1 entries that cached transient empty results as
    // permanent answers (the bug this hook now defends against). See
    // main.tsx's `buster` for the matching session-wide flush.
    queryKey: ["trace-sources", "v2", key],
    enabled: addrs.length > 0,
    queryFn: async (): Promise<Record<string, TraceSourceEntry>> => {
      const entries = await Promise.all(
        addrs.map(
          async (addr): Promise<[string, TraceSourceEntry] | null> => {
            const result = await fetchTraceSourceFiles(addr);
            if (result === null) return null;
            return [addr.toLowerCase(), result];
          },
        ),
      );
      const out: Record<string, TraceSourceEntry> = {};
      for (const entry of entries) if (entry) out[entry[0]] = entry[1];
      return out;
    },
    staleTime: (q) => {
      const data = q.state.data;
      if (!data) return Infinity;
      const allResolved = lowerAddresses.every(
        (addr) => data[addr] !== undefined,
      );
      if (!allResolved) return 0;
      const anyUnverified = Object.values(data).some((e) => !e.verified);
      return anyUnverified ? UNVERIFIED_TTL_MS : Infinity;
    },
  });

  const data: Record<string, SourceFile[]> = {};
  for (const [addr, entry] of Object.entries(query.data ?? {})) {
    data[addr] = entry.files;
  }
  return { data, refetch: query.refetch };
}
