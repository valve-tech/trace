import { useState, useEffect, useCallback } from "react";
import {
  fetchRpcStats,
  checkRpcConnection,
  type RpcStatsResponse,
  type MethodStats,
} from "../../api/rpc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLatency(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimeAgo(ts: number): string {
  if (ts === 0) return "Never";
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function errorRate(stats: MethodStats): string {
  if (stats.count === 0) return "0%";
  return `${((stats.errorCount / stats.count) * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RpcDashboard() {
  const [stats, setStats] = useState<RpcStatsResponse | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const rpcUrl = `${window.location.origin}/rpc`;

  const refresh = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([fetchRpcStats(), checkRpcConnection()]);
      setStats(s);
      setConnected(c);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, [refresh]);

  const handleCopy = () => {
    navigator.clipboard.writeText(rpcUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Sorted method breakdown
  const methodEntries = stats
    ? Object.entries(stats.methodBreakdown).sort(
        ([, a], [, b]) => b.count - a.count,
      )
    : [];

  const totalRequests = stats?.totalRequests ?? 0;
  const avgLatency =
    methodEntries.length > 0
      ? Math.round(
          methodEntries.reduce((sum, [, s]) => sum + s.avgLatency * s.count, 0) /
            Math.max(totalRequests, 1),
        )
      : 0;
  const totalErrors = methodEntries.reduce((sum, [, s]) => sum + s.errorCount, 0);
  const overallErrorRate =
    totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(1) : "0.0";

  const cardStyle = {
    backgroundColor: "var(--color-bg-card)",
    boxShadow: "0 0 0 1px var(--color-border-default)",
  };

  const labelStyle = { color: "var(--color-text-secondary)" };
  const valueStyle = { color: "var(--color-text-primary)" };

  return (
    <div className="space-y-6">
      {/* RPC Endpoint URL */}
      <div
        className="rounded-lg p-4 flex items-center justify-between gap-4"
        style={cardStyle}
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium mb-1" style={labelStyle}>
            RPC Endpoint
          </div>
          <div
            className="text-sm font-mono truncate"
            style={valueStyle}
          >
            {rpcUrl}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Connection status */}
          <div className="flex items-center gap-1.5 text-xs" style={labelStyle}>
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  connected === null
                    ? "var(--color-text-muted)"
                    : connected
                      ? "var(--color-success)"
                      : "var(--color-danger)",
              }}
            />
            {connected === null ? "Checking..." : connected ? "Connected" : "Disconnected"}
          </div>
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-md bs text-xs font-medium transition-colors"
            style={{
              color: copied ? "var(--color-success)" : "var(--color-text-secondary)",
              backgroundColor: "var(--color-bg-secondary)",
            }}
          >
            {copied ? "Copied!" : "Copy URL"}
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg p-4" style={cardStyle}>
          <div className="text-xs font-medium mb-1" style={labelStyle}>
            Total Requests
          </div>
          <div className="text-2xl font-semibold" style={valueStyle}>
            {loading ? "--" : totalRequests.toLocaleString()}
          </div>
        </div>

        <div className="rounded-lg p-4" style={cardStyle}>
          <div className="text-xs font-medium mb-1" style={labelStyle}>
            Avg Latency
          </div>
          <div className="text-2xl font-semibold" style={valueStyle}>
            {loading ? "--" : formatLatency(avgLatency)}
          </div>
        </div>

        <div className="rounded-lg p-4" style={cardStyle}>
          <div className="text-xs font-medium mb-1" style={labelStyle}>
            Error Rate
          </div>
          <div
            className="text-2xl font-semibold"
            style={{
              color:
                totalErrors > 0
                  ? "var(--color-danger)"
                  : "var(--color-text-primary)",
            }}
          >
            {loading ? "--" : `${overallErrorRate}%`}
          </div>
        </div>
      </div>

      {/* Method breakdown table */}
      <div className="rounded-lg overflow-hidden" style={cardStyle}>
        <div
          className="px-4 py-3 bs-b text-sm font-semibold"
          style={{
            color: "var(--color-text-primary)",
          }}
        >
          Method Breakdown
        </div>
        {methodEntries.length === 0 ? (
          <div className="p-8 text-center text-sm" style={labelStyle}>
            {loading ? "Loading..." : "No requests recorded yet. Send some RPC requests to see stats here."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="bs-b"
                  style={{}}
                >
                  <th className="text-left px-4 py-2 font-medium" style={labelStyle}>
                    Method
                  </th>
                  <th className="text-right px-4 py-2 font-medium" style={labelStyle}>
                    Calls
                  </th>
                  <th className="text-right px-4 py-2 font-medium" style={labelStyle}>
                    Avg Latency
                  </th>
                  <th className="text-right px-4 py-2 font-medium" style={labelStyle}>
                    Error %
                  </th>
                  <th className="text-right px-4 py-2 font-medium" style={labelStyle}>
                    Last Called
                  </th>
                </tr>
              </thead>
              <tbody>
                {methodEntries.map(([method, s]) => (
                  <tr
                    key={method}
                    className="bs-b last:shadow-none hover:opacity-80 transition-opacity"
                    style={{}}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs" style={valueStyle}>
                      {method}
                    </td>
                    <td className="px-4 py-2.5 text-right" style={valueStyle}>
                      {s.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right" style={labelStyle}>
                      {formatLatency(s.avgLatency)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right"
                      style={{
                        color:
                          s.errorCount > 0
                            ? "var(--color-danger)"
                            : "var(--color-text-secondary)",
                      }}
                    >
                      {errorRate(s)}
                    </td>
                    <td className="px-4 py-2.5 text-right" style={labelStyle}>
                      {formatTimeAgo(s.lastCalled)}
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
