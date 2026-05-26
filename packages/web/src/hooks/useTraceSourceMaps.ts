import { useQuery } from "@tanstack/react-query";
import { fetchSourceMappings, type SourceLocation } from "../api/source";

type SourceMap = Record<number, SourceLocation | null>;

/**
 * Fetch source maps for EVERY contract in the trace, keyed by address, so the
 * call tree can trace internal functions across all contracts — not just the
 * one currently executing. `pcsByContract` is the set of program counters each
 * contract actually ran (so we don't request a contract's whole pc space).
 *
 * Each contract's map is gated server-side on a bytecode-structure match;
 * unverified or mismatched contracts simply return an empty map. Compilation
 * is cached on the verified_sources row, so this is one compile per contract.
 */
export function useTraceSourceMaps(pcsByContract: Record<string, number[]>) {
  const addrs = Object.keys(pcsByContract).sort();
  // Stable key: address + pc-count per contract (pc sets are deterministic).
  const key = addrs.map((a) => `${a}:${pcsByContract[a]!.length}`).join(",");

  return useQuery({
    queryKey: ["trace-source-maps", key],
    enabled: addrs.length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<Record<string, SourceMap>> => {
      const entries = await Promise.all(
        addrs.map(async (addr): Promise<[string, SourceMap]> => {
          try {
            const res = await fetchSourceMappings(addr, pcsByContract[addr]!);
            return [addr, res.ok ? res.mappings ?? {} : {}];
          } catch {
            return [addr, {}];
          }
        }),
      );
      return Object.fromEntries(entries);
    },
  });
}
