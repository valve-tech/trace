import { useQuery } from "@tanstack/react-query";
import { fetchBlock } from "../../../api/explorer";
import { useActiveChainId } from "../../../lib/activeChain";
import { PreviewShell, shortHex, ago } from "./PreviewShell";

/**
 * Compact summary of a block. Confirmed blocks are immutable; `staleTime:
 * Infinity` is safe.
 */
export function BlockPreview({ numberOrHash }: { numberOrHash: string }) {
  const chainId = useActiveChainId();
  const query = useQuery({
    queryKey: ["workspace-preview-block", chainId, numberOrHash.toLowerCase()],
    queryFn: () => fetchBlock(numberOrHash, chainId),
    staleTime: Infinity,
  });

  if (query.isLoading) {
    return <PreviewShell loading facts={[]} />;
  }
  if (query.error) {
    return <PreviewShell error="Couldn't load block preview." facts={[]} />;
  }
  if (!query.data) return null;

  const b = query.data;
  const gasPct = b.gasLimit !== "0"
    ? `${((Number(b.gasUsed) / Number(b.gasLimit)) * 100).toFixed(1)}%`
    : null;

  return (
    <PreviewShell
      facts={[
        { label: "Number", value: Number(b.number).toLocaleString(), mono: true },
        { label: "Txs", value: b.transactionCount.toLocaleString() },
        { label: "Miner", value: shortHex(b.miner), mono: true },
        { label: "Gas used", value: gasPct, mono: true },
      ]}
      footer={`mined ${ago(b.timestamp)}`}
    />
  );
}
