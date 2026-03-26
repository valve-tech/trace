import { useQuery } from "@tanstack/react-query";
import { resolveContractNames } from "../api/contractNames";

export function useContractNames(addresses: string[]) {
  const key = addresses.map((a) => a.toLowerCase()).sort().join(",");
  return useQuery({
    queryKey: ["contract-names", key],
    queryFn: () => resolveContractNames(addresses),
    enabled: addresses.length > 0,
  });
}
