import { useState, useEffect, useCallback } from "react";
import {
  listAlerts,
  deleteAlert,
  updateAlert,
  testAlert,
  type Alert,
  type AlertStats,
} from "../../api/alerts";
import AlertBuilder from "./AlertBuilder";
import AlertHistory from "./AlertHistory";

// ---------------------------------------------------------------------------
// Type badge colors
// ---------------------------------------------------------------------------
const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  address_activity: {
    label: "Address",
    color: "var(--color-accent)",
    bg: "var(--color-accent-muted)",
  },
  contract_event: {
    label: "Event",
    color: "var(--color-success)",
    bg: "var(--color-success-muted)",
  },
  function_call: {
    label: "Function",
    color: "var(--color-warning)",
    bg: "var(--color-warning-muted)",
  },
  balance_threshold: {
    label: "Balance",
    color: "#58a6ff",
    bg: "rgba(88, 166, 255, 0.15)",
  },
  failed_tx: {
    label: "Failed TX",
    color: "var(--color-danger)",
    bg: "var(--color-danger-muted)",
  },
};

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
type View =
  | { type: "list" }
  | { type: "create" }
  | { type: "edit"; alert: Alert }
  | { type: "history"; alertId: number; alertName: string };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AlertDashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<AlertStats>({
    total: 0,
    active: 0,
    triggered_today: 0,
  });
  const [view, setView] = useState<View>({ type: "list" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAlerts();
      setAlerts(data.alerts);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAlerts();
  }, [fetchAlerts]);

  const handleToggleEnabled = async (alert: Alert) => {
    try {
      await updateAlert(alert.id, {
        name: alert.name,
        type: alert.type,
        conditions: alert.conditions,
        notifications: alert.notifications,
        enabled: !alert.enabled,
        cooldown_seconds: alert.cooldown_seconds,
      });
      await fetchAlerts();
    } catch (err) {
      console.error("Failed to toggle alert:", err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this alert?")) return;
    try {
      await deleteAlert(id);
      await fetchAlerts();
    } catch (err) {
      console.error("Failed to delete alert:", err);
    }
  };

  const handleTest = async (id: number) => {
    try {
      await testAlert(id);
      alert("Test notification sent!");
    } catch (err) {
      alert(
        `Test failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  const handleSaved = () => {
    setView({ type: "list" });
    void fetchAlerts();
  };

  const cardStyle = {
    backgroundColor: "var(--color-bg-card)",
    borderColor: "var(--color-border-default)",
  };

  // -----------------------------------------------------------------------
  // Render sub-views
  // -----------------------------------------------------------------------
  if (view.type === "create") {
    return <AlertBuilder onSaved={handleSaved} onCancel={() => setView({ type: "list" })} />;
  }

  if (view.type === "edit") {
    return (
      <AlertBuilder
        alert={view.alert}
        onSaved={handleSaved}
        onCancel={() => setView({ type: "list" })}
      />
    );
  }

  if (view.type === "history") {
    return (
      <AlertHistory
        alertId={view.alertId}
        alertName={view.alertName}
        onBack={() => setView({ type: "list" })}
      />
    );
  }

  // -----------------------------------------------------------------------
  // Main list view
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4" style={cardStyle}>
          <p
            className="text-xs font-medium mb-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Total Alerts
          </p>
          <p
            className="text-2xl font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {stats.total}
          </p>
        </div>
        <div className="rounded-lg border p-4" style={cardStyle}>
          <p
            className="text-xs font-medium mb-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Active
          </p>
          <p
            className="text-2xl font-bold"
            style={{ color: "var(--color-success)" }}
          >
            {stats.active}
          </p>
        </div>
        <div className="rounded-lg border p-4" style={cardStyle}>
          <p
            className="text-xs font-medium mb-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Triggered Today
          </p>
          <p
            className="text-2xl font-bold"
            style={{ color: "var(--color-warning)" }}
          >
            {stats.triggered_today}
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Alerts
        </h2>
        <button
          onClick={() => setView({ type: "create" })}
          className="text-sm px-4 py-2 rounded-lg font-medium"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "white",
          }}
        >
          Create Alert
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
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

      {/* Empty state */}
      {!loading && alerts.length === 0 && (
        <div className="rounded-lg border p-8 text-center" style={cardStyle}>
          <p
            className="text-sm mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            No alerts configured yet.
          </p>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Create an alert to start monitoring PulseChain activity.
          </p>
        </div>
      )}

      {/* Alert cards */}
      {!loading &&
        alerts.map((a) => {
          const typeInfo = TYPE_LABELS[a.type] ?? {
            label: a.type,
            color: "var(--color-text-secondary)",
            bg: "var(--color-bg-tertiary)",
          };

          return (
            <div
              key={a.id}
              className="rounded-lg border p-4"
              style={{
                ...cardStyle,
                opacity: a.enabled ? 1 : 0.6,
              }}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left side */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3
                      className="text-sm font-semibold truncate"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {a.name}
                    </h3>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider shrink-0"
                      style={{
                        backgroundColor: typeInfo.bg,
                        color: typeInfo.color,
                      }}
                    >
                      {typeInfo.label}
                    </span>
                  </div>

                  <div
                    className="flex items-center gap-4 text-xs"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    <span>
                      Cooldown: {a.cooldown_seconds}s
                    </span>
                    <span>
                      Channels: {a.notifications.length}
                    </span>
                    {a.last_triggered_at && (
                      <span>
                        Last triggered:{" "}
                        {new Date(a.last_triggered_at + "Z").toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side - actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => void handleToggleEnabled(a)}
                    className="relative w-10 h-5 rounded-full transition-colors"
                    title={a.enabled ? "Disable" : "Enable"}
                    style={{
                      backgroundColor: a.enabled
                        ? "var(--color-success)"
                        : "var(--color-border-default)",
                    }}
                  >
                    <span
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                      style={{
                        left: a.enabled ? "calc(100% - 18px)" : "2px",
                      }}
                    />
                  </button>

                  {/* History */}
                  <button
                    onClick={() =>
                      setView({
                        type: "history",
                        alertId: a.id,
                        alertName: a.name,
                      })
                    }
                    className="text-xs px-2.5 py-1 rounded-md border"
                    style={{
                      borderColor: "var(--color-border-default)",
                      color: "var(--color-text-secondary)",
                      backgroundColor: "transparent",
                    }}
                  >
                    History
                  </button>

                  {/* Test */}
                  <button
                    onClick={() => void handleTest(a.id)}
                    className="text-xs px-2.5 py-1 rounded-md"
                    style={{
                      backgroundColor: "var(--color-accent-muted)",
                      color: "var(--color-accent)",
                    }}
                  >
                    Test
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => setView({ type: "edit", alert: a })}
                    className="text-xs px-2.5 py-1 rounded-md border"
                    style={{
                      borderColor: "var(--color-border-default)",
                      color: "var(--color-text-secondary)",
                      backgroundColor: "transparent",
                    }}
                  >
                    Edit
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => void handleDelete(a.id)}
                    className="text-xs px-2.5 py-1 rounded-md"
                    style={{
                      backgroundColor: "var(--color-danger-muted)",
                      color: "var(--color-danger)",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}
