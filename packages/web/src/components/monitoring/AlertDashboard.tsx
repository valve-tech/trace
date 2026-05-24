import { useState, useEffect, useRef, useCallback } from "react";
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
import { useAlertWebSocket, type AlertEvent } from "../../hooks/useAlertWebSocket";
import AlertToast from "../AlertToast";

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

  const { connected, lastAlert } = useAlertWebSocket();
  const [activeToast, setActiveToast] = useState<AlertEvent | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLastAlertRef = useRef<AlertEvent | null>(null);

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

  // Prepend incoming WebSocket alerts to the list and show a toast
  useEffect(() => {
    if (lastAlert === null || lastAlert === prevLastAlertRef.current) return;
    prevLastAlertRef.current = lastAlert;

    const incoming = lastAlert.data.alert;
    setAlerts((prev) => {
      const exists = prev.some((a) => a.id === incoming.id);
      if (exists) return prev;
      // Build a minimal Alert shape from the WebSocket payload; fields not
      // present in the WS message get sensible defaults so the card renders.
      const synthetic: Alert = {
        id: incoming.id,
        name: incoming.name,
        type: incoming.type as Alert["type"],
        conditions: {},
        notifications: [],
        enabled: true,
        cooldown_seconds: 0,
        last_triggered_at: new Date().toISOString().replace("Z", ""),
        created_at: new Date().toISOString().replace("Z", ""),
        updated_at: new Date().toISOString().replace("Z", ""),
      };
      return [synthetic, ...prev];
    });

    // Show toast; clear any previous dismiss timer
    if (toastTimerRef.current !== null) {
      clearTimeout(toastTimerRef.current);
    }
    setActiveToast(lastAlert);
    toastTimerRef.current = setTimeout(() => {
      setActiveToast(null);
      toastTimerRef.current = null;
    }, 6_000); // slightly longer than the toast's own 5 s so it finishes sliding out
  }, [lastAlert]);

  // Cleanup toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

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
    <div className="space-y-section">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
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
        <div className="card p-4">
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
        <div className="card p-4">
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
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-row">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Alerts
          </h2>
          {connected && (
            <div className="flex items-center gap-1.5">
              <div
                style={{
                  width: "0.5rem",
                  height: "0.5rem",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-success)",
                  boxShadow: "0 0 6px var(--color-success)",
                }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: "var(--color-success)" }}
              >
                Live
              </span>
            </div>
          )}
        </div>
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

      {/* Empty state */}
      {!loading && alerts.length === 0 && (
        <div className="card p-8 text-center">
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

      {/* Live alert toast */}
      {activeToast !== null && (
        <AlertToast
          alert={activeToast.data.alert}
          match={activeToast.data.match}
        />
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
              className="card p-4"
              style={{ opacity: a.enabled ? 1 : 0.6 }}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left side */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-inline mb-2">
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
                <div className="flex items-center gap-inline shrink-0">
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
                    className="text-xs px-2.5 py-1 rounded-md bs"
                    style={{
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
                    className="text-xs px-2.5 py-1 rounded-md bs"
                    style={{
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
