import { useState, useEffect } from "react";
import { fetchTransaction, type TransactionDetails } from "../../api/explorer";

interface TxDetailProps {
  hash: string;
  onNavigate: (target: { type: "address" | "block"; value: string }) => void;
}

function truncateAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function StatusBadge({ status }: { status: "success" | "reverted" }) {
  const success = status === "success";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{
        backgroundColor: success
          ? "var(--color-success-muted)"
          : "var(--color-danger-muted)",
        color: success ? "var(--color-success)" : "var(--color-danger)",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          backgroundColor: success
            ? "var(--color-success)"
            : "var(--color-danger)",
        }}
      />
      {success ? "Success" : "Reverted"}
    </span>
  );
}

function AddressLink({
  address,
  onNavigate,
  label,
}: {
  address: string;
  onNavigate: (target: { type: "address"; value: string }) => void;
  label?: string;
}) {
  return (
    <button
      onClick={() => onNavigate({ type: "address", value: address })}
      className="font-mono text-sm hover:underline cursor-pointer"
      style={{ color: "var(--color-accent)" }}
      title={address}
    >
      {label || truncateAddr(address)}
    </button>
  );
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
      className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-2.5 border-b last:border-b-0"
      style={{ borderColor: "var(--color-border-muted)" }}
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

function SectionCard({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-lg border"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {title}
          </h3>
          {count !== undefined && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--color-accent-muted)",
                color: "var(--color-accent)",
              }}
            >
              {count}
            </span>
          )}
        </div>
        <svg
          className="w-4 h-4 transition-transform"
          style={{
            color: "var(--color-text-muted)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {open && (
        <div
          className="px-4 pb-4 border-t"
          style={{ borderColor: "var(--color-border-muted)" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return "Unknown";
  const d = new Date(ts * 1000);
  const ago = Math.floor((Date.now() - d.getTime()) / 1000);
  let agoStr = "";
  if (ago < 60) agoStr = `${ago}s ago`;
  else if (ago < 3600) agoStr = `${Math.floor(ago / 60)}m ago`;
  else if (ago < 86400) agoStr = `${Math.floor(ago / 3600)}h ago`;
  else agoStr = `${Math.floor(ago / 86400)}d ago`;
  return `${d.toISOString().replace("T", " ").replace("Z", " UTC")} (${agoStr})`;
}

function formatGwei(weiStr: string): string {
  try {
    const wei = BigInt(weiStr);
    const gwei = Number(wei) / 1e9;
    return `${gwei.toFixed(2)} Gwei`;
  } catch {
    return weiStr;
  }
}

function formatPLS(valuePLS: string): string {
  const num = parseFloat(valuePLS);
  if (num === 0) return "0 PLS";
  if (num < 0.0001) return `${num.toExponential(4)} PLS`;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 6 })} PLS`;
}

function renderParamValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function TxDetail({ hash, onNavigate }: TxDetailProps) {
  const [tx, setTx] = useState<TransactionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTx(null);

    fetchTransaction(hash)
      .then((data) => {
        if (!cancelled) setTx(data);
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
  }, [hash]);

  if (loading) {
    return (
      <div
        className="rounded-lg border p-8 flex flex-col items-center justify-center min-h-[300px]"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
        }}
      >
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mb-3"
          style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
        />
        <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Loading transaction...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-danger)",
        }}
      >
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            style={{ color: "var(--color-danger)" }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <h3
              className="text-sm font-semibold mb-1"
              style={{ color: "var(--color-danger)" }}
            >
              Error
            </h3>
            <p
              className="text-sm"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-secondary)",
              }}
            >
              {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!tx) return null;

  const gasPercent = tx.gas !== "0"
    ? ((Number(tx.gasUsed) / Number(tx.gas)) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-4">
      {/* Overview */}
      <SectionCard title="Transaction Overview">
        <div className="pt-2">
          <InfoRow label="Transaction Hash">
            <span
              className="font-mono break-all"
              style={{ color: "var(--color-text-primary)" }}
            >
              {tx.hash}
            </span>
          </InfoRow>
          <InfoRow label="Status">
            <StatusBadge status={tx.status} />
          </InfoRow>
          <InfoRow label="Block">
            <button
              onClick={() =>
                onNavigate({ type: "block", value: tx.blockNumber })
              }
              className="font-mono text-sm hover:underline cursor-pointer"
              style={{ color: "var(--color-accent)" }}
            >
              {Number(tx.blockNumber).toLocaleString()}
            </button>
          </InfoRow>
          <InfoRow label="Timestamp">
            <span style={{ color: "var(--color-text-primary)" }}>
              {formatTimestamp(tx.timestamp)}
            </span>
          </InfoRow>
          <InfoRow label="From">
            <AddressLink address={tx.from} onNavigate={onNavigate} />
          </InfoRow>
          <InfoRow label="To">
            {tx.to ? (
              <div className="flex items-center gap-2">
                <AddressLink address={tx.to} onNavigate={onNavigate} />
                {tx.contractAddress && (
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: "var(--color-success-muted)",
                      color: "var(--color-success)",
                    }}
                  >
                    Contract Creation
                  </span>
                )}
              </div>
            ) : (
              <span
                className="text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                Contract Creation
                {tx.contractAddress && (
                  <>
                    {" "}
                    <AddressLink
                      address={tx.contractAddress}
                      onNavigate={onNavigate}
                    />
                  </>
                )}
              </span>
            )}
          </InfoRow>
          <InfoRow label="Value">
            <span
              className="font-mono"
              style={{ color: "var(--color-text-primary)" }}
            >
              {formatPLS(tx.valuePLS)}
            </span>
          </InfoRow>
          <InfoRow label="Gas Used / Limit">
            <span style={{ color: "var(--color-text-primary)" }}>
              <span className="font-mono">
                {Number(tx.gasUsed).toLocaleString()}
              </span>
              <span style={{ color: "var(--color-text-muted)" }}> / </span>
              <span className="font-mono">
                {Number(tx.gas).toLocaleString()}
              </span>
              <span
                className="ml-2 text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                ({gasPercent}%)
              </span>
            </span>
          </InfoRow>
          <InfoRow label="Gas Price">
            <span
              className="font-mono"
              style={{ color: "var(--color-text-primary)" }}
            >
              {formatGwei(tx.gasPrice)}
            </span>
          </InfoRow>
          <InfoRow label="Nonce">
            <span
              className="font-mono"
              style={{ color: "var(--color-text-primary)" }}
            >
              {tx.nonce}
            </span>
          </InfoRow>
          <InfoRow label="Type">
            <span style={{ color: "var(--color-text-primary)" }}>
              {tx.type}
            </span>
          </InfoRow>
        </div>
      </SectionCard>

      {/* Decoded Function Call */}
      {tx.decodedInput && (
        <SectionCard title="Decoded Function Call">
          <div className="pt-3">
            <div
              className="px-3 py-2 rounded-md mb-3 text-sm"
              style={{
                fontFamily: "var(--font-mono)",
                backgroundColor: "var(--color-accent-muted)",
                color: "var(--color-accent)",
              }}
            >
              {tx.decodedInput.functionName}(
              {tx.decodedInput.args.map((p) => p.type).join(", ")})
            </div>
            {tx.decodedInput.args.length > 0 && (
              <div
                className="rounded-md border overflow-hidden"
                style={{ borderColor: "var(--color-border-muted)" }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      style={{
                        backgroundColor: "var(--color-bg-secondary)",
                      }}
                    >
                      <th
                        className="text-left px-3 py-2 text-xs font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        #
                      </th>
                      <th
                        className="text-left px-3 py-2 text-xs font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Name
                      </th>
                      <th
                        className="text-left px-3 py-2 text-xs font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Type
                      </th>
                      <th
                        className="text-left px-3 py-2 text-xs font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tx.decodedInput.args.map((arg, i) => (
                      <tr
                        key={i}
                        className="border-t hover:opacity-80"
                        style={{ borderColor: "var(--color-border-muted)" }}
                      >
                        <td
                          className="px-3 py-2"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {i}
                        </td>
                        <td
                          className="px-3 py-2 font-medium"
                          style={{ color: "var(--color-accent)" }}
                        >
                          {arg.name || `param${i}`}
                        </td>
                        <td
                          className="px-3 py-2"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {arg.type}
                        </td>
                        <td
                          className="px-3 py-2 font-mono break-all max-w-[400px]"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {renderParamValue(arg.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Events / Logs */}
      {(tx.decodedLogs.length > 0 || tx.rawLogs.length > 0) && (
        <SectionCard
          title="Events / Logs"
          count={tx.rawLogs.length}
        >
          <div className="pt-3 space-y-2">
            {tx.rawLogs.map((rawLog, i) => {
              const decoded = tx.decodedLogs.find(
                (d) => d.logIndex === rawLog.logIndex,
              );
              return (
                <div
                  key={i}
                  className="rounded-md border p-3"
                  style={{
                    backgroundColor: "var(--color-bg-secondary)",
                    borderColor: "var(--color-border-muted)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: "var(--color-bg-primary)",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      #{rawLog.logIndex}
                    </span>
                    {decoded && (
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--color-warning)" }}
                      >
                        {decoded.eventName}
                      </span>
                    )}
                    <AddressLink
                      address={rawLog.address}
                      onNavigate={onNavigate}
                    />
                  </div>
                  {decoded ? (
                    <div className="space-y-1 ml-2">
                      {decoded.args.map((arg, j) => (
                        <div
                          key={j}
                          className="flex items-start gap-2 text-xs"
                        >
                          <span
                            className="font-medium shrink-0"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            {arg.name || `arg${j}`}
                          </span>
                          <span
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            ({arg.type})
                          </span>
                          <span
                            className="font-mono break-all"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {renderParamValue(arg.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1 ml-2">
                      {rawLog.topics.map((topic, j) => (
                        <div key={j} className="text-xs">
                          <span
                            className="font-medium"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            Topic {j}:
                          </span>{" "}
                          <span
                            className="font-mono break-all"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {topic}
                          </span>
                        </div>
                      ))}
                      {rawLog.data !== "0x" && (
                        <div className="text-xs">
                          <span
                            className="font-medium"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            Data:
                          </span>{" "}
                          <span
                            className="font-mono break-all"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {rawLog.data}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Internal Transactions */}
      {tx.internalTransactions.length > 0 && (
        <SectionCard
          title="Internal Transactions"
          count={tx.internalTransactions.length}
          defaultOpen={false}
        >
          <div className="pt-3">
            <div
              className="rounded-md border overflow-x-auto"
              style={{ borderColor: "var(--color-border-muted)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      backgroundColor: "var(--color-bg-secondary)",
                    }}
                  >
                    <th
                      className="text-left px-3 py-2 text-xs font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      Type
                    </th>
                    <th
                      className="text-left px-3 py-2 text-xs font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      From
                    </th>
                    <th
                      className="text-left px-3 py-2 text-xs font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      To
                    </th>
                    <th
                      className="text-left px-3 py-2 text-xs font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      Value
                    </th>
                    <th
                      className="text-left px-3 py-2 text-xs font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      Gas Used
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tx.internalTransactions.map((itx, i) => (
                    <tr
                      key={i}
                      className="border-t hover:opacity-80"
                      style={{ borderColor: "var(--color-border-muted)" }}
                    >
                      <td className="px-3 py-2">
                        <span
                          className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: "var(--color-bg-primary)",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {itx.type}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <AddressLink
                          address={itx.from}
                          onNavigate={onNavigate}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <AddressLink
                          address={itx.to}
                          onNavigate={onNavigate}
                        />
                      </td>
                      <td
                        className="px-3 py-2 font-mono"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {formatPLS(itx.valuePLS)}
                      </td>
                      <td
                        className="px-3 py-2 font-mono"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {Number(itx.gasUsed).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Token Transfers */}
      {tx.tokenTransfers.length > 0 && (
        <SectionCard
          title="Token Transfers"
          count={tx.tokenTransfers.length}
          defaultOpen={false}
        >
          <div className="pt-3">
            <div
              className="rounded-md border overflow-x-auto"
              style={{ borderColor: "var(--color-border-muted)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      backgroundColor: "var(--color-bg-secondary)",
                    }}
                  >
                    <th
                      className="text-left px-3 py-2 text-xs font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      Token
                    </th>
                    <th
                      className="text-left px-3 py-2 text-xs font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      From
                    </th>
                    <th
                      className="text-left px-3 py-2 text-xs font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      To
                    </th>
                    <th
                      className="text-left px-3 py-2 text-xs font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tx.tokenTransfers.map((tt, i) => (
                    <tr
                      key={i}
                      className="border-t hover:opacity-80"
                      style={{ borderColor: "var(--color-border-muted)" }}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span style={{ color: "var(--color-text-primary)" }}>
                            {tt.tokenName || "Unknown"}
                          </span>
                          <span
                            className="text-[10px] font-medium"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {tt.tokenSymbol}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <AddressLink
                          address={tt.from}
                          onNavigate={onNavigate}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <AddressLink
                          address={tt.to}
                          onNavigate={onNavigate}
                        />
                      </td>
                      <td
                        className="px-3 py-2 font-mono"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {tt.formattedValue} {tt.tokenSymbol}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Raw Data */}
      <SectionCard title="Raw Data" defaultOpen={false}>
        <div className="pt-3 space-y-3">
          <div>
            <span
              className="text-xs font-medium block mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Input Data
            </span>
            <div
              className="rounded-md p-3 text-xs font-mono break-all max-h-48 overflow-y-auto"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
              }}
            >
              {tx.input || "0x"}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
