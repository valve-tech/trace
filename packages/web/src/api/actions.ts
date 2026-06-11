import { apiUrl } from "../lib/apiBase";
import { scoped } from "./chainScope";
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Action {
  id: number;
  name: string;
  code: string;
  /** EIP-155 chain the action is pinned to (block/event feed + RPC). */
  chainid: number;
  triggerType: "block" | "event" | "periodic" | "webhook";
  triggerConfig: Record<string, unknown>;
  secretKeys: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  webhookUrl?: string;
}

export interface ActionLog {
  id: number;
  action_id: number;
  triggered_at: string;
  duration_ms: number;
  success: number;
  stdout: string;
  stderr: string;
  trigger_data: string;
}

export interface ActionStats {
  total: number;
  active: number;
  todayExecutions: number;
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  duration_ms: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// API base
// ---------------------------------------------------------------------------
const API_BASE = apiUrl("/api/actions");

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let message: string;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      message = parsed.error ?? text;
    } catch {
      message = text;
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export async function createAction(
  data: {
    name: string;
    code: string;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
    secrets?: Record<string, string>;
  },
  chainId?: number,
): Promise<Action> {
  const res = await fetch(scoped(API_BASE, chainId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await handleResponse<{ ok: boolean; action: Action }>(res);
  return body.action;
}

export async function listActions(chainId?: number): Promise<{
  actions: Action[];
  stats: ActionStats;
}> {
  const res = await fetch(scoped(API_BASE, chainId));
  return handleResponse<{ ok: boolean; actions: Action[]; stats: ActionStats }>(res);
}

export async function getAction(id: number): Promise<Action> {
  const res = await fetch(`${API_BASE}/${id}`);
  const body = await handleResponse<{ ok: boolean; action: Action }>(res);
  return body.action;
}

export async function updateAction(
  id: number,
  data: {
    name?: string;
    code?: string;
    triggerType?: string;
    triggerConfig?: Record<string, unknown>;
    secrets?: Record<string, string>;
    enabled?: boolean;
  },
): Promise<Action> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await handleResponse<{ ok: boolean; action: Action }>(res);
  return body.action;
}

export async function deleteAction(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
  await handleResponse<{ ok: boolean }>(res);
}

// ---------------------------------------------------------------------------
// Test / Execute
// ---------------------------------------------------------------------------
export async function testAction(
  id: number,
  event?: Record<string, unknown>,
): Promise<ExecutionResult> {
  const res = await fetch(`${API_BASE}/${id}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: event ?? {} }),
  });
  const body = await handleResponse<{ ok: boolean; result: ExecutionResult }>(res);
  return body.result;
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------
export async function getActionLogs(
  id: number,
  page: number = 1,
  limit: number = 20,
): Promise<{
  rows: ActionLog[];
  total: number;
  page: number;
  limit: number;
}> {
  const res = await fetch(`${API_BASE}/${id}/logs?page=${page}&limit=${limit}`);
  return handleResponse<{
    ok: boolean;
    rows: ActionLog[];
    total: number;
    page: number;
    limit: number;
  }>(res);
}
