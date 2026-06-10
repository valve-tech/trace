import { useQuery } from "@tanstack/react-query";
import { fetchTraceSourceMap, type SourceLocation } from "../api/source";
import { useActiveChainId } from "../lib/activeChain";

type SourceMap = Record<number, SourceLocation | null>;

interface SourceMapEntry {
  mappings: SourceMap;
  mapped: boolean;
}

const UNMAPPABLE_TTL_MS = 15 * 60 * 1000;

/**
 * Fetch source maps for EVERY contract in the trace, keyed by address. Two
 * fixes over the v1 shape:
 *
 *   1. The queryFn now returns a *sparse* record on transient upstream
 *      failures (addresses with no definitive answer are omitted, not
 *      returned as empty mappings). Under our `staleTime: Infinity` defaults,
 *      a swallowed transient used to pin `{}` forever — the debugger's
 *      InternalCallTree then ran without source-map data for that contract
 *      and silently lost call-site override + step↔source navigation.
 *
 *   2. Stale-time is decided per-result: full + all-mapped → ∞; sparse → 0
 *      (immediate retry on next mount); full + any-unmappable → 15min TTL
 *      (because recompilation can succeed later or the contract can become
 *      verified upstream).
 *
 * Mirrors the proven pattern from useContractMeta + useTraceSources.
 */
export function useTraceSourceMaps(pcsByContract: Record<string, number[]>) {
  const addrs = Object.keys(pcsByContract).sort();
  // Stable key: address + pc-count per contract (pc sets are deterministic).
  const key = addrs.map((a) => `${a}:${pcsByContract[a]!.length}`).join(",");
  const lowerAddrs = addrs.map((a) => a.toLowerCase());
  const chainId = useActiveChainId();

  const query = useQuery({
    // `v2` busts persisted caches from the pre-retry shape; old v1 entries
    // held `{}` for every contract that hit a Blockscout outage and pinned
    // them forever, silently disabling source-map nav across reloads.
    queryKey: ["trace-source-maps", "v2", chainId, key],
    enabled: addrs.length > 0,
    queryFn: async (): Promise<Record<string, SourceMapEntry>> => {
      const entries = await Promise.all(
        addrs.map(async (addr) => {
          const result = await fetchTraceSourceMap(addr, pcsByContract[addr]!);
          if (result === null) return null;
          return [addr.toLowerCase(), result] as [string, SourceMapEntry];
        }),
      );
      const out: Record<string, SourceMapEntry> = {};
      for (const entry of entries) if (entry) out[entry[0]] = entry[1];
      return out;
    },
    staleTime: (q) => {
      const data = q.state.data;
      if (!data) return Infinity;
      const allResolved = lowerAddrs.every((addr) => data[addr] !== undefined);
      if (!allResolved) return 0;
      const anyUnmappable = Object.values(data).some((e) => !e.mapped);
      return anyUnmappable ? UNMAPPABLE_TTL_MS : Infinity;
    },
  });

  // Flatten back to the shape the call tree consumes: { [addr]: SourceMap }
  const data: Record<string, SourceMap> = {};
  for (const [addr, entry] of Object.entries(query.data ?? {})) {
    data[addr] = entry.mappings;
  }
  return { data, refetch: query.refetch, isLoading: query.isLoading };
}
