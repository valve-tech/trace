import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchHoldings, type HoldingsResult } from "../api/portfolio";

/**
 * Holdings for an address on a chain, from the substreams-backed
 * /api/portfolio/holdings endpoint. Balances drift, so a 60s staleTime
 * (shorter than the Infinity default used for immutable data) keeps the
 * portfolio reasonably fresh without hammering the API on every expand.
 *
 * `enabled` lets callers gate the fetch (e.g. only when a workspace row is
 * expanded) so a large workspace doesn't fan out every holdings query at once.
 */
export function usePortfolioHoldings(
  address: string,
  chainId: number,
  enabled = true,
): UseQueryResult<HoldingsResult> {
  return useQuery({
    queryKey: ["portfolio-holdings", chainId, address.toLowerCase()],
    queryFn: () => fetchHoldings(address, chainId),
    staleTime: 60 * 1000,
    enabled,
  });
}
