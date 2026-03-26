import { useQuery } from "@tanstack/react-query";
import { batchLookupSignatures } from "../api/signatures";

export function useSignatures(selectors: string[]) {
  const key = selectors.sort().join(",");
  return useQuery({
    queryKey: ["signatures", key],
    queryFn: () => batchLookupSignatures(selectors),
    enabled: selectors.length > 0,
  });
}
