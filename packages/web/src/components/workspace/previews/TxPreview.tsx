import { useQuery } from "@tanstack/react-query";
import { fetchTransaction } from "../../../api/explorer";
import { useActiveChainId } from "../../../lib/activeChain";
import { PreviewShell, shortHex, ago } from "./PreviewShell";

/**
 * Compact summary of a transaction. Confirmed txs are immutable on chain so
 * the cache is `staleTime: Infinity` — a hit refills instantly on remount.
 */
export function TxPreview({ hash }: { hash: string }) {
  const chainId = useActiveChainId();
  const query = useQuery({
    queryKey: ["workspace-preview-tx", chainId, hash.toLowerCase()],
    queryFn: () => fetchTransaction(hash, chainId),
    staleTime: Infinity,
  });

  if (query.isLoading) {
    return <PreviewShell loading facts={[]} />;
  }
  if (query.error) {
    return <PreviewShell error="Couldn't load transaction preview." facts={[]} />;
  }
  if (!query.data) return null;

  const tx = query.data;
  const fn = tx.decodedInput?.functionName ?? null;

  return (
    <PreviewShell
      facts={[
        {
          label: "Status",
          value: (
            <span className={tx.status === "success" ? "theme-success" : "theme-danger"}>
              {tx.status}
            </span>
          ),
        },
        { label: "Method", value: fn ?? null },
        { label: "From", value: shortHex(tx.from), mono: true },
        { label: "To", value: tx.to ? shortHex(tx.to) : "(contract creation)", mono: true },
        { label: "Value", value: tx.valuePLS, mono: true },
        { label: "Block", value: Number(tx.blockNumber).toLocaleString(), mono: true },
      ]}
      footer={tx.timestamp ? `mined ${ago(tx.timestamp)}` : null}
    />
  );
}
