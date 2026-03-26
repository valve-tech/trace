import { useQuery } from "@tanstack/react-query";
import { fetchSource, fetchSourceMappings } from "../api/source";

export function useContractSource(address: string | null | undefined) {
  return useQuery({
    queryKey: ["source", address?.toLowerCase()],
    queryFn: () => fetchSource(address!),
    enabled: !!address,
    select: (data) => data.ok ? data.source ?? null : null,
  });
}

export function useSourceMappings(address: string | null | undefined, pcs: number[]) {
  return useQuery({
    queryKey: ["source-map", address?.toLowerCase(), pcs.length],
    queryFn: () => fetchSourceMappings(address!, pcs),
    enabled: !!address && pcs.length > 0,
    select: (data) => data.ok ? data.mappings ?? {} : {},
  });
}
