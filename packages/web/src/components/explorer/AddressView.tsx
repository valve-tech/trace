import { useState, useEffect } from "react";
import {
  fetchAddressInfo,
  fetchAddressTransactions,
  fetchAddressTokens,
  type AddressInfo,
  type AddressTransaction,
  type AddressToken,
} from "../../api/explorer";

interface AddressViewProps {
  address: string;
  onNavigate: (target: { type: "tx" | "address" | "block" | "contract"; value: string }) => void;
}

function truncateAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatPLS(valuePLS: string): string {
  const num = parseFloat(valuePLS);
  if (num === 0) return "0 PLS";
  if (num < 0.0001) return `${num.toExponential(4)} PLS`;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 6 })} PLS`;
}

function formatTimestamp(ts: string): string {
  if (!ts) return "";
  const d = new Date(Number(ts) * 1000);
  const now = Date.now();
  const ago = Math.floor((now - d.getTime()) / 1000);
  if (ago < 60) return `${ago}s ago`;
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
  if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`;
  return `${Math.floor(ago / 86400)}d ago`;
}

type SubTab = "transactions" | "tokens";

export default function AddressView({
  address,
  onNavigate,
}: AddressViewProps) {
  const [info, setInfo] = useState<AddressInfo | null>(null);
  const [txs, setTxs] = useState<AddressTransaction[]>([]);
  const [tokens, setTokens] = useState<AddressToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [subTab, setSubTab] = useState<SubTab>("transactions");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchAddressInfo(address),
      fetchAddressTransactions(address, 1, 25),
      fetchAddressTokens(address),
    ])
      .then(([addrInfo, txData, tokenData]) => {
        if (!cancelled) {
          setInfo(addrInfo);
          setTxs(txData.transactions);
          setTokens(tokenData);
          setPage(1);
        }
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
  }, [address]);

  const loadPage = async (newPage: number) => {
    try {
      const data = await fetchAddressTransactions(address, newPage, 25);
      setTxs(data.transactions);
      setPage(newPage);
    } catch {
      // keep current
    }
  };

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
          Loading address...
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

  return (
    <div className="space-y-4">
      {/* Address Header */}
      <div
        className="rounded-lg border p-4"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2
                className="text-sm font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                Address
              </h2>
              {info?.isContract && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                  style={{
                    backgroundColor: "var(--color-accent-muted)",
                    color: "var(--color-accent)",
                  }}
                >
                  Contract
                </span>
              )}
            </div>
            <span
              className="font-mono text-sm break-all"
              style={{ color: "var(--color-text-primary)" }}
            >
              {address}
            </span>
          </div>
          <div className="text-right">
            <span
              className="text-xs block mb-0.5"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Balance
            </span>
            <span
              className="font-mono text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {info ? formatPLS(info.balancePLS) : "..."}
            </span>
          </div>
        </div>
        {info?.isContract && (
          <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--color-border-muted)" }}>
            <button
              onClick={() => onNavigate({ type: "contract", value: address })}
              className="text-xs font-medium hover:underline cursor-pointer"
              style={{ color: "var(--color-accent)" }}
            >
              View Contract Details
            </button>
          </div>
        )}
      </div>

      {/* Sub-tab navigation */}
      <div
        className="flex gap-0 border-b"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <button
          onClick={() => setSubTab("transactions")}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
          style={{
            borderColor:
              subTab === "transactions"
                ? "var(--color-accent)"
                : "transparent",
            color:
              subTab === "transactions"
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
            backgroundColor: "transparent",
          }}
        >
          Transactions
          {txs.length > 0 && (
            <span
              className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--color-accent-muted)",
                color: "var(--color-accent)",
              }}
            >
              {txs.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab("tokens")}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
          style={{
            borderColor:
              subTab === "tokens" ? "var(--color-accent)" : "transparent",
            color:
              subTab === "tokens"
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
            backgroundColor: "transparent",
          }}
        >
          Token Balances
          {tokens.length > 0 && (
            <span
              className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--color-accent-muted)",
                color: "var(--color-accent)",
              }}
            >
              {tokens.length}
            </span>
          )}
        </button>
      </div>

      {/* Transactions tab */}
      {subTab === "transactions" && (
        <div
          className="rounded-lg border overflow-hidden"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
          }}
        >
          {txs.length === 0 ? (
            <div
              className="p-6 text-center text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              No transactions found
            </div>
          ) : (
            <>
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
                        Block
                      </th>
                      <th
                        className="text-left px-3 py-2.5 text-xs font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Age
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
                      <th
                        className="text-left px-3 py-2.5 text-xs font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx, i) => {
                      const isIn =
                        tx.to?.toLowerCase() === address.toLowerCase();
                      return (
                        <tr
                          key={i}
                          className="border-t hover:opacity-80"
                          style={{
                            borderColor: "var(--color-border-muted)",
                          }}
                        >
                          <td className="px-3 py-2">
                            <button
                              onClick={() =>
                                onNavigate({
                                  type: "tx",
                                  value: tx.hash,
                                })
                              }
                              className="font-mono text-xs hover:underline cursor-pointer"
                              style={{ color: "var(--color-accent)" }}
                              title={tx.hash}
                            >
                              {truncateAddr(tx.hash)}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() =>
                                onNavigate({
                                  type: "block",
                                  value: tx.blockNumber,
                                })
                              }
                              className="font-mono text-xs hover:underline cursor-pointer"
                              style={{ color: "var(--color-accent)" }}
                            >
                              {Number(tx.blockNumber).toLocaleString()}
                            </button>
                          </td>
                          <td
                            className="px-3 py-2 text-xs whitespace-nowrap"
                            style={{
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            {formatTimestamp(tx.timeStamp)}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() =>
                                onNavigate({
                                  type: "address",
                                  value: tx.from,
                                })
                              }
                              className="font-mono text-xs hover:underline cursor-pointer"
                              style={{
                                color: "var(--color-accent)",
                              }}
                              title={tx.from}
                            >
                              {truncateAddr(tx.from)}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="text-[9px] font-bold px-1 py-0.5 rounded"
                                style={{
                                  backgroundColor: isIn
                                    ? "var(--color-success-muted)"
                                    : "var(--color-warning-muted)",
                                  color: isIn
                                    ? "var(--color-success)"
                                    : "var(--color-warning)",
                                }}
                              >
                                {isIn ? "IN" : "OUT"}
                              </span>
                              <button
                                onClick={() =>
                                  onNavigate({
                                    type: "address",
                                    value: tx.to,
                                  })
                                }
                                className="font-mono text-xs hover:underline cursor-pointer"
                                style={{
                                  color: "var(--color-accent)",
                                }}
                                title={tx.to}
                              >
                                {truncateAddr(tx.to)}
                              </button>
                            </div>
                          </td>
                          <td
                            className="px-3 py-2 font-mono text-xs whitespace-nowrap"
                            style={{
                              color: "var(--color-text-primary)",
                            }}
                          >
                            {formatPLS(tx.valuePLS)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{
                                backgroundColor:
                                  tx.isError === "0"
                                    ? "var(--color-success)"
                                    : "var(--color-danger)",
                              }}
                              title={
                                tx.isError === "0"
                                  ? "Success"
                                  : "Error"
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div
                className="flex items-center justify-between px-3 py-2.5 border-t"
                style={{ borderColor: "var(--color-border-muted)" }}
              >
                <button
                  onClick={() => loadPage(page - 1)}
                  disabled={page <= 1}
                  className="text-xs font-medium px-3 py-1.5 rounded transition-colors cursor-pointer"
                  style={{
                    backgroundColor:
                      page > 1
                        ? "var(--color-bg-secondary)"
                        : "transparent",
                    color:
                      page > 1
                        ? "var(--color-text-primary)"
                        : "var(--color-text-muted)",
                    cursor: page > 1 ? "pointer" : "not-allowed",
                  }}
                >
                  Previous
                </button>
                <span
                  className="text-xs"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Page {page}
                </span>
                <button
                  onClick={() => loadPage(page + 1)}
                  disabled={txs.length < 25}
                  className="text-xs font-medium px-3 py-1.5 rounded transition-colors cursor-pointer"
                  style={{
                    backgroundColor:
                      txs.length >= 25
                        ? "var(--color-bg-secondary)"
                        : "transparent",
                    color:
                      txs.length >= 25
                        ? "var(--color-text-primary)"
                        : "var(--color-text-muted)",
                    cursor: txs.length >= 25 ? "pointer" : "not-allowed",
                  }}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tokens tab */}
      {subTab === "tokens" && (
        <div
          className="rounded-lg border overflow-hidden"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
          }}
        >
          {tokens.length === 0 ? (
            <div
              className="p-6 text-center text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              No tokens found
            </div>
          ) : (
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
                    Token
                  </th>
                  <th
                    className="text-left px-3 py-2.5 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Symbol
                  </th>
                  <th
                    className="text-left px-3 py-2.5 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Balance
                  </th>
                  <th
                    className="text-left px-3 py-2.5 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Contract
                  </th>
                  <th
                    className="text-left px-3 py-2.5 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Type
                  </th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token, i) => (
                  <tr
                    key={i}
                    className="border-t hover:opacity-80"
                    style={{
                      borderColor: "var(--color-border-muted)",
                    }}
                  >
                    <td
                      className="px-3 py-2"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {token.name || "Unknown"}
                    </td>
                    <td
                      className="px-3 py-2 font-mono"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {token.symbol}
                    </td>
                    <td
                      className="px-3 py-2 font-mono"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {token.formattedBalance}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() =>
                          onNavigate({
                            type: "address",
                            value: token.contractAddress,
                          })
                        }
                        className="font-mono text-xs hover:underline cursor-pointer"
                        style={{ color: "var(--color-accent)" }}
                        title={token.contractAddress}
                      >
                        {truncateAddr(token.contractAddress)}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: "var(--color-bg-secondary)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {token.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
