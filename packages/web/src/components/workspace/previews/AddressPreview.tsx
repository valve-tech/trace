import { useQuery } from "@tanstack/react-query";
import { fetchAddressInfo, fetchContractInfo } from "../../../api/explorer";
import { PreviewShell } from "./PreviewShell";

/**
 * Compact summary of an address: balance, contract-vs-EOA, and (if a
 * verified contract) the contract name. Fetches on first expand —
 * collapsed rows never trigger a request, so a 50-item workspace
 * doesn't fan out 50 simultaneous queries.
 *
 * Staleness: balance is live data but very stale-tolerant for a workspace
 * preview (the user clicks through to the canonical Explore view when they
 * want to act). 5min staleTime trades freshness for not re-fetching the
 * same address every time a row is expanded.
 */
export function AddressPreview({ address }: { address: string }) {
  const info = useQuery({
    queryKey: ["workspace-preview-address", address.toLowerCase()],
    queryFn: () => fetchAddressInfo(address),
    staleTime: 5 * 60 * 1000,
  });
  // Verified-name lookup only fires once we know the address has code —
  // an EOA never has a contractName so the second query is wasted.
  const contract = useQuery({
    queryKey: ["workspace-preview-contract", address.toLowerCase()],
    queryFn: () => fetchContractInfo(address),
    enabled: info.data?.isContract === true,
    staleTime: Infinity,
  });

  if (info.isLoading) {
    return <PreviewShell loading facts={[]} />;
  }
  if (info.error) {
    return <PreviewShell error="Couldn't load address preview." facts={[]} />;
  }
  if (!info.data) return null;

  const kind = info.data.isContract ? "Contract" : "EOA";
  const name = contract.data?.contractName?.trim() || null;
  const verified = contract.data?.isVerified ?? false;

  return (
    <PreviewShell
      facts={[
        { label: "Kind", value: kind },
        { label: "Balance", value: info.data.balancePLS, mono: true },
        ...(info.data.isContract
          ? [
              { label: "Name", value: name ?? "Unverified" },
              { label: "Verified", value: verified ? "Yes" : "No" },
            ]
          : []),
      ]}
    />
  );
}
