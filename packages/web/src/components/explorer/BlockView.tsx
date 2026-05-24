import { useState, useEffect } from "react";
import { fetchBlock, type BlockDetails } from "../../api/explorer";
import TxRowActions from "./TxRowActions";
import { formatPLS } from "./format";
import { ExplorerLink } from "./ExplorerLink";

interface BlockViewProps {
  numberOrHash: string;
  onNavigate: (target: { type: "tx" | "address" | "block"; value: string }) => void;
}

function truncateAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  const ago = Math.floor((Date.now() - d.getTime()) / 1000);
  let agoStr = "";
  if (ago < 60) agoStr = `${ago}s ago`;
  else if (ago < 3600) agoStr = `${Math.floor(ago / 60)}m ago`;
  else if (ago < 86400) agoStr = `${Math.floor(ago / 3600)}h ago`;
  else agoStr = `${Math.floor(ago / 86400)}d ago`;
  return `${d.toISOString().replace("T", " ").replace("Z", " UTC")} (${agoStr})`;
}


function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-start gap-tight sm:gap-4 py-2.5 bs-b-muted last:shadow-none"
      style={{}}
    >
      <span
        className="text-xs font-medium shrink-0 sm:w-40"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </span>
      <div className="text-sm flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default function BlockView({
  numberOrHash,
  onNavigate,
}: BlockViewProps) {
  const [block, setBlock] = useState<BlockDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBlock(null);

    fetchBlock(numberOrHash)
      .then((data) => {
        if (!cancelled) setBlock(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [numberOrHash]);

  if (loading) {
    return (
      <div
        className="rounded-lg bs p-8 flex flex-col items-center justify-center min-h-[300px]"
        style={{
          backgroundColor: "var(--color-bg-card)",
        }}
      >
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mb-3"
          style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
        />
        <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Loading block...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg p-6"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-danger)",
        }}
      >
        <h3
          className="text-sm font-semibold mb-1"
          style={{ color: "var(--color-danger)" }}
        >
          Error
        </h3>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!block) return null;

  const gasPercent = block.gasLimit !== "0"
    ? ((Number(block.gasUsed) / Number(block.gasLimit)) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-stack">
      {/* Block Info */}
      <div
        className="rounded-lg bs p-4"
        style={{
          backgroundColor: "var(--color-bg-card)",
        }}
      >
        <div className="flex items-center gap-row mb-3 pb-3 bs-b-muted" style={{}}>
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Block
          </h2>
          <span
            className="font-mono text-sm font-semibold"
            style={{ color: "var(--color-accent)" }}
          >
            #{Number(block.number).toLocaleString()}
          </span>
          {/* Block nav */}
          <div className="flex items-center gap-tight ml-auto">
            <button
              onClick={() => {
                const prevNum = Number(block.number) - 1;
                if (prevNum >= 0) onNavigate({ type: "block", value: String(prevNum) });
              }}
              disabled={Number(block.number) <= 0}
              className="text-xs px-2 py-1 rounded hover:opacity-80 cursor-pointer"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
                color: "var(--color-text-secondary)",
              }}
            >
              Prev
            </button>
            <button
              onClick={() =>
                onNavigate({
                  type: "block",
                  value: String(Number(block.number) + 1),
                })
              }
              className="text-xs px-2 py-1 rounded hover:opacity-80 cursor-pointer"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
                color: "var(--color-text-secondary)",
              }}
            >
              Next
            </button>
          </div>
        </div>

        <InfoRow label="Block Hash">
          <span
            className="font-mono break-all"
            style={{ color: "var(--color-text-primary)" }}
          >
            {block.hash}
          </span>
        </InfoRow>
        <InfoRow label="Timestamp">
          <span style={{ color: "var(--color-text-primary)" }}>
            {formatTimestamp(block.timestamp)}
          </span>
        </InfoRow>
        <InfoRow label="Transactions">
          <span
            className="font-mono"
            style={{ color: "var(--color-text-primary)" }}
          >
            {block.transactionCount}
          </span>
        </InfoRow>
        <InfoRow label="Miner / Validator">
          <ExplorerLink
            target={{ type: "address", value: block.miner }}
            onNavigate={onNavigate}
            className="font-mono text-sm hover:underline cursor-pointer"
            style={{ color: "var(--color-accent)" }}
            title={block.miner}
          >
            {truncateAddr(block.miner)}
          </ExplorerLink>
        </InfoRow>
        <InfoRow label="Gas Used / Limit">
          <span style={{ color: "var(--color-text-primary)" }}>
            <span className="font-mono">
              {Number(block.gasUsed).toLocaleString()}
            </span>
            <span style={{ color: "var(--color-text-muted)" }}> / </span>
            <span className="font-mono">
              {Number(block.gasLimit).toLocaleString()}
            </span>
            <span
              className="ml-2 text-xs"
              style={{ color: "var(--color-text-secondary)" }}
            >
              ({gasPercent}%)
            </span>
          </span>
        </InfoRow>
        {block.baseFeePerGas && (
          <InfoRow label="Base Fee">
            <span
              className="font-mono"
              style={{ color: "var(--color-text-primary)" }}
            >
              {(Number(block.baseFeePerGas) / 1e9).toFixed(2)} Gwei
            </span>
          </InfoRow>
        )}
        <InfoRow label="Size">
          <span
            className="font-mono"
            style={{ color: "var(--color-text-primary)" }}
          >
            {Number(block.size).toLocaleString()} bytes
          </span>
        </InfoRow>
        <InfoRow label="Parent Hash">
          <ExplorerLink
            // Parent is navigated by number (current - 1), not by hash.
            target={{
              type: "block",
              value: String(Math.max(0, Number(block.number) - 1)),
            }}
            onNavigate={onNavigate}
            className="font-mono text-sm break-all hover:underline cursor-pointer"
            style={{ color: "var(--color-accent)" }}
          >
            {block.parentHash}
          </ExplorerLink>
        </InfoRow>
      </div>

      {/* Transactions */}
      <div
        className="rounded-lg bs overflow-hidden"
        style={{
          backgroundColor: "var(--color-bg-card)",
        }}
      >
        <div
          className="px-4 py-3 bs-b-muted"
          style={{}}
        >
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Transactions
            <span
              className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--color-accent-muted)",
                color: "var(--color-accent)",
              }}
            >
              {block.transactionCount}
            </span>
          </h3>
        </div>

        {block.transactions.length === 0 ? (
          <div
            className="p-6 text-center text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            No transactions in this block
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--color-bg-secondary)",
                  }}
                >
                  <th
                    className="text-left px-3 py-2.5 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Tx Hash
                  </th>
                  <th
                    className="text-left px-3 py-2.5 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Method
                  </th>
                  <th
                    className="text-left px-3 py-2.5 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    From
                  </th>
                  <th
                    className="text-left px-3 py-2.5 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    To
                  </th>
                  <th
                    className="text-left px-3 py-2.5 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Value
                  </th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {block.transactions.map((tx, i) => (
                  <tr
                    key={i}
                    className="bs-t-muted hover:opacity-80"
                    style={{
                    }}
                  >
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
                      {tx.methodId && tx.methodId !== "0x" ? (
                        <span
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: "var(--color-bg-primary)",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {tx.methodId}
                        </span>
                      ) : (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: "var(--color-success-muted)",
                            color: "var(--color-success)",
                          }}
                        >
                          Transfer
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {tx.from ? (
                        <button
                          onClick={() =>
                            onNavigate({
                              type: "address",
                              value: tx.from,
                            })
                          }
                          className="font-mono text-xs hover:underline cursor-pointer"
                          style={{ color: "var(--color-accent)" }}
                          title={tx.from}
                        >
                          {truncateAddr(tx.from)}
                        </button>
                      ) : (
                        <span
                          className="text-xs"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          -
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {tx.to ? (
                        <button
                          onClick={() =>
                            onNavigate({
                              type: "address",
                              value: tx.to!,
                            })
                          }
                          className="font-mono text-xs hover:underline cursor-pointer"
                          style={{ color: "var(--color-accent)" }}
                          title={tx.to}
                        >
                          {truncateAddr(tx.to)}
                        </button>
                      ) : (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: "var(--color-accent-muted)",
                            color: "var(--color-accent)",
                          }}
                        >
                          Create
                        </span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2 font-mono text-xs whitespace-nowrap"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {formatPLS(tx.valuePLS)}
                    </td>
                    <td className="px-3 py-2 text-right relative">
                      <TxRowActions
                        hash={tx.hash}
                        contractAddress={tx.to ?? null}
                        compact
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
