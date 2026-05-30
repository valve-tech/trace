import { useQuery } from "@tanstack/react-query";
import { resolveContractMeta, type ContractMeta } from "../api/contractMeta";

/**
 * Resolve verified name + ABI selector map for a set of addresses in one
 * fetch per address, and split the result into the two lookups the call tree
 * consumes: address → name, and address → (selector → function name).
 */
export function useContractMeta(addresses: string[]) {
  const key = addresses.map((a) => a.toLowerCase()).sort().join(",");
  const lowerAddresses = addresses.map((a) => a.toLowerCase());
  const query = useQuery({
    // The `v3` segment busts persisted caches from before resolveContractMeta
    // switched to retry-then-omit semantics (1763a47). Old v2 entries can hold
    // partial records that the new staleTime function below would treat as
    // permanently stale — bumping the version flushes them in one shot.
    queryKey: ["contract-meta", "v3", key],
    queryFn: () => resolveContractMeta(addresses),
    enabled: addresses.length > 0,
    // resolveContractMeta deliberately returns a *sparse* record on transient
    // upstream failures (addresses with no definitive answer are omitted, not
    // returned as empty meta — see contractMeta.ts). Under the global
    // `staleTime: Infinity` defaults, a sparse result would get pinned in
    // IndexedDB forever, masking the contracts for the rest of the session.
    //
    // We decide staleness per-result: a *complete* record (every requested
    // address resolved) is canonical and caches forever; an *incomplete*
    // record is stale immediately so the next mount of this hook re-runs
    // resolveContractMeta and reattempts the missing addresses.
    staleTime: (query) => {
      const data = query.state.data;
      if (!data) return Infinity;
      const allResolved = lowerAddresses.every(
        (addr) => data[addr] !== undefined,
      );
      return allResolved ? Infinity : 0;
    },
  });

  const meta: Record<string, ContractMeta> = query.data ?? {};
  const names: Record<string, string | null> = {};
  const abiSelectors: Record<string, Record<string, string>> = {};
  const eventTopics: Record<string, Record<string, string>> = {};
  for (const [addr, m] of Object.entries(meta)) {
    names[addr] = m.name;
    abiSelectors[addr] = m.selectors;
    eventTopics[addr] = m.events;
  }

  return { names, abiSelectors, eventTopics };
}
