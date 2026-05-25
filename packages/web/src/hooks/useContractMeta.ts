import { useQuery } from "@tanstack/react-query";
import { resolveContractMeta, type ContractMeta } from "../api/contractMeta";

/**
 * Resolve verified name + ABI selector map for a set of addresses in one
 * fetch per address, and split the result into the two lookups the call tree
 * consumes: address → name, and address → (selector → function name).
 */
export function useContractMeta(addresses: string[]) {
  const key = addresses.map((a) => a.toLowerCase()).sort().join(",");
  const query = useQuery({
    queryKey: ["contract-meta", key],
    queryFn: () => resolveContractMeta(addresses),
    enabled: addresses.length > 0,
  });

  const meta: Record<string, ContractMeta> = query.data ?? {};
  const names: Record<string, string | null> = {};
  const abiSelectors: Record<string, Record<string, string>> = {};
  for (const [addr, m] of Object.entries(meta)) {
    names[addr] = m.name;
    abiSelectors[addr] = m.selectors;
  }

  return { names, abiSelectors };
}
