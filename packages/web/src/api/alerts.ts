const API_BASE = "/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AlertConditions {
  address?: string;
  contractAddress?: string;
  eventSignature?: string;
  functionSelector?: string;
  threshold?: string;
  direction?: "above" | "below";
}

export interface NotificationChannel {
  type: "webhook" | "discord" | "slack" | "telegram";
  url?: string;
  webhookUrl?: string;
  botToken?: string;
  chatId?: string;
}

export type AlertType =
  | "address_activity"
  | "contract_event"
  | "function_call"
  | "balance_threshold"
  | "failed_tx";

export interface Alert {
  id: number;
  name: string;
  type: AlertType;
  conditions: AlertConditions;
  notifications: NotificationChannel[];
  enabled: boolean;
  cooldown_seconds: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertStats {
  total: number;
  active: number;
  triggered_today: number;
}

export interface AlertHistoryEntry {
  id: number;
  alert_id: number;
  triggered_at: string;
  tx_hash: string | null;
  block_number: number | null;
  matched_data: Record<string, unknown>;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CreateAlertPayload {
  name: string;
  type: AlertType;
  conditions: AlertConditions;
  notifications: NotificationChannel[];
  enabled: boolean;
  cooldown_seconds: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function listAlerts(): Promise<{
  alerts: Alert[];
  stats: AlertStats;
}> {
  const res = await fetch(`${API_BASE}/alerts`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((err as { error?: string }).error ?? "Failed to list alerts");
  }
  const data = (await res.json()) as {
    ok: boolean;
    alerts: Alert[];
    stats: AlertStats;
  };
  return { alerts: data.alerts, stats: data.stats };
}

export async function getAlert(id: number): Promise<{
  alert: Alert;
  recent_history: AlertHistoryEntry[];
}> {
  const res = await fetch(`${API_BASE}/alerts/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((err as { error?: string }).error ?? "Failed to get alert");
  }
  const data = (await res.json()) as {
    ok: boolean;
    alert: Alert;
    recent_history: AlertHistoryEntry[];
  };
  return { alert: data.alert, recent_history: data.recent_history };
}

export async function createAlert(
  payload: CreateAlertPayload,
): Promise<Alert> {
  const res = await fetch(`${API_BASE}/alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(
      (err as { error?: string; details?: unknown[] }).error ??
        "Failed to create alert",
    );
  }
  const data = (await res.json()) as { ok: boolean; alert: Alert };
  return data.alert;
}

export async function updateAlert(
  id: number,
  payload: CreateAlertPayload,
): Promise<Alert> {
  const res = await fetch(`${API_BASE}/alerts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((err as { error?: string }).error ?? "Failed to update alert");
  }
  const data = (await res.json()) as { ok: boolean; alert: Alert };
  return data.alert;
}

export async function deleteAlert(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/alerts/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((err as { error?: string }).error ?? "Failed to delete alert");
  }
}

export async function getAlertHistory(
  id: number,
  page: number = 1,
  limit: number = 20,
): Promise<{
  history: AlertHistoryEntry[];
  pagination: PaginationInfo;
}> {
  const res = await fetch(
    `${API_BASE}/alerts/${id}/history?page=${page}&limit=${limit}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((err as { error?: string }).error ?? "Failed to get history");
  }
  const data = (await res.json()) as {
    ok: boolean;
    history: AlertHistoryEntry[];
    pagination: PaginationInfo;
  };
  return { history: data.history, pagination: data.pagination };
}

export async function testAlert(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/alerts/${id}/test`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((err as { error?: string }).error ?? "Failed to test alert");
  }
}
