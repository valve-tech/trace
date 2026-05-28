import { useQuery } from "@tanstack/react-query";
import { fetchSource, type SourceFile } from "../api/source";

/**
 * Fetch the source FILES for every contract in the trace, keyed by lower-cased
 * address. Parallels useTraceSourceMaps (which fetches pc→location maps): this
 * gives the call tree the raw source it needs to name internal functions
 * exactly and tell library calls apart from a contract's own internals.
 * Unverified contracts return an empty file list.
 */
export function useTraceSources(addrs: string[]) {
  const key = [...addrs].map((a) => a.toLowerCase()).sort().join(",");

  return useQuery({
    queryKey: ["trace-sources", key],
    enabled: addrs.length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<Record<string, SourceFile[]>> => {
      const entries = await Promise.all(
        addrs.map(async (addr): Promise<[string, SourceFile[]]> => {
          try {
            const res = await fetchSource(addr);
            return [addr.toLowerCase(), res.ok ? res.source?.files ?? [] : []];
          } catch {
            return [addr.toLowerCase(), []];
          }
        }),
      );
      return Object.fromEntries(entries);
    },
  });
}
