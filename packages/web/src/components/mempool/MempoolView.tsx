import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { fetchPending } from "../../api/mempool";
import { ExplorerLink } from "../explorer/ExplorerLink";
import { TxGasInfo } from "../explorer/TxGasInfo";
import { truncateAddr } from "../explorer/format";

export default function MempoolView() {
  const navigate = useNavigate();
  const onNavigate = (t: { type: string; value: string }) => {
    const key = t.type === "tx" ? "tx" : t.type === "block" ? "block" : "address";
    navigate(`/explorer?${key}=${t.value}`);
  };

  const { data, status, error } = useQuery({
    queryKey: ["mempool-pending"],
    queryFn: fetchPending,
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  return (
    <div className="space-y-stack">
      {/* Header */}
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-inline">
          <Icon
            icon="heroicons:queue-list"
            className="w-4 h-4"
            style={{ color: "var(--color-accent)" }}
          />
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Mempool
          </h2>
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            pending, ordered by effective priority tip
          </span>
        </div>
        {data && (
          <div
            className="flex items-center gap-row text-xs font-mono"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <span>{data.pendingCount.toLocaleString()} pending</span>
            <span style={{ color: "var(--color-text-muted)" }}>
              {data.queuedCount.toLocaleString()} queued
            </span>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        {status === "pending" && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
            Loading pending transactions…
          </div>
        )}
        {status === "error" && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--color-danger)" }}>
            {error instanceof Error ? error.message : "Failed to load mempool"}
          </div>
        )}
        {status === "success" && data.transactions.length === 0 && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
            No pending transactions.
          </div>
        )}
        {status === "success" && data.transactions.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--color-bg-secondary)" }}>
                {["#", "Tx Hash", "From", "Nonce", "Gas / Type"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2.5 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((tx, i) => (
                <tr key={tx.hash} className="bs-t-muted hover:opacity-80">
                  <td
                    className="px-3 py-2 text-xs font-mono tabular-nums"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {i + 1}
                  </td>
                  <td className="px-3 py-2">
                    <ExplorerLink
                      target={{ type: "tx", value: tx.hash }}
                      onNavigate={onNavigate}
                      className="font-mono text-xs hover:underline cursor-pointer"
                      style={{ color: "var(--color-accent)" }}
                      title={tx.hash}
                    >
                      {truncateAddr(tx.hash)}
                    </ExplorerLink>
                  </td>
                  <td className="px-3 py-2">
                    <ExplorerLink
                      target={{ type: "address", value: tx.from }}
                      onNavigate={onNavigate}
                      className="font-mono text-xs hover:underline cursor-pointer"
                      style={{ color: "var(--color-accent)" }}
                      title={tx.from}
                    >
                      {truncateAddr(tx.from)}
                    </ExplorerLink>
                  </td>
                  <td
                    className="px-3 py-2 font-mono text-xs tabular-nums"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {tx.nonce.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <TxGasInfo
                      type={tx.type}
                      gasPrice={tx.gasPrice}
                      maxFeePerGas={tx.maxFeePerGas}
                      maxPriorityFeePerGas={tx.maxPriorityFeePerGas}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
