import { useState, useEffect, useCallback } from "react";
import {
  getAlertHistory,
  type AlertHistoryEntry,
  type PaginationInfo,
} from "../../api/alerts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface AlertHistoryProps {
  alertId: number;
  alertName: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AlertHistory({
  alertId,
  alertName,
  onBack,
}: AlertHistoryProps) {
  const [history, setHistory] = useState<AlertHistoryEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAlertHistory(alertId, page, 20);
      setHistory(data.history);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch history");
    } finally {
      setLoading(false);
    }
  }, [alertId, page]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const cardStyle = {
    backgroundColor: "var(--color-bg-card)",
    boxShadow: "0 0 0 1px var(--color-border-default)",
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "Z");
    return d.toLocaleString();
  };

  const truncateHash = (hash: string) => {
    if (hash.length <= 16) return hash;
    return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-sm px-3 py-1.5 rounded-md bs"
          style={{
            color: "var(--color-text-secondary)",
            backgroundColor: "transparent",
          }}
        >
          Back
        </button>
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          History: {alertName}
        </h2>
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: "var(--color-danger-muted)",
            borderColor: "var(--color-danger)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="spinner" />
        </div>
      )}

      {/* Table */}
      {!loading && history.length === 0 && (
        <div
          className="rounded-lg p-8 text-center"
          style={cardStyle}
        >
          <p style={{ color: "var(--color-text-muted)" }}>
            No alert history yet.
          </p>
        </div>
      )}

      {!loading && history.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={cardStyle}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="bs-b-muted"
                  style={{}}
                >
                  <th
                    className="text-left px-4 py-3 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Timestamp
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    TX Hash
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Block
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Summary
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr
                    key={entry.id}
                    className="bs-b-muted last:shadow-none"
                    style={{}}
                  >
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {formatDate(entry.triggered_at)}
                    </td>
                    <td className="px-4 py-3">
                      {entry.tx_hash ? (
                        <a
                          href={`https://scan.pulsechain.com/tx/${entry.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                          style={{
                            color: "var(--color-accent)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "12px",
                          }}
                        >
                          {truncateHash(entry.tx_hash)}
                        </a>
                      ) : (
                        <span style={{ color: "var(--color-text-muted)" }}>
                          --
                        </span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3"
                      style={{
                        color: "var(--color-text-primary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "12px",
                      }}
                    >
                      {entry.block_number?.toLocaleString() ?? "--"}
                    </td>
                    <td
                      className="px-4 py-3 max-w-xs truncate"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {(entry.matched_data as Record<string, string>).summary ??
                        "Alert triggered"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div
              className="flex items-center justify-between px-4 py-3 bs-t-muted"
              style={{}}
            >
              <span
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                Page {pagination.page} of {pagination.totalPages} ({pagination.total}{" "}
                entries)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 text-xs rounded-md bs"
                  style={{
                    color:
                      page <= 1
                        ? "var(--color-text-muted)"
                        : "var(--color-text-secondary)",
                    backgroundColor: "transparent",
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                    opacity: page <= 1 ? 0.5 : 1,
                  }}
                >
                  Previous
                </button>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                  disabled={page >= pagination.totalPages}
                  className="px-3 py-1 text-xs rounded-md bs"
                  style={{
                    color:
                      page >= pagination.totalPages
                        ? "var(--color-text-muted)"
                        : "var(--color-text-secondary)",
                    backgroundColor: "transparent",
                    cursor:
                      page >= pagination.totalPages ? "not-allowed" : "pointer",
                    opacity: page >= pagination.totalPages ? 0.5 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
