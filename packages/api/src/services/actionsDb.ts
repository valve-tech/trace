import Database, { type Database as DatabaseType } from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// Ensure data directory exists
// ---------------------------------------------------------------------------
const dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, "actions.db");

// ---------------------------------------------------------------------------
// Initialize database
// ---------------------------------------------------------------------------
const db: DatabaseType = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Schema setup
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    trigger_type TEXT NOT NULL CHECK(trigger_type IN ('block', 'event', 'periodic', 'webhook')),
    trigger_config TEXT NOT NULL DEFAULT '{}',
    secrets TEXT NOT NULL DEFAULT '{}',
    storage TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
    duration_ms INTEGER NOT NULL DEFAULT 0,
    success INTEGER NOT NULL DEFAULT 0,
    stdout TEXT NOT NULL DEFAULT '',
    stderr TEXT NOT NULL DEFAULT '',
    trigger_data TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_action_logs_action_id ON action_logs(action_id);
  CREATE INDEX IF NOT EXISTS idx_action_logs_triggered_at ON action_logs(triggered_at);
`);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ActionRow {
  id: number;
  name: string;
  code: string;
  trigger_type: string;
  trigger_config: string;
  secrets: string;
  storage: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface ActionLogRow {
  id: number;
  action_id: number;
  triggered_at: string;
  duration_ms: number;
  success: number;
  stdout: string;
  stderr: string;
  trigger_data: string;
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------
const insertAction = db.prepare(`
  INSERT INTO actions (name, code, trigger_type, trigger_config, secrets)
  VALUES (@name, @code, @trigger_type, @trigger_config, @secrets)
`);

const updateActionStmt = db.prepare(`
  UPDATE actions
  SET name = @name,
      code = @code,
      trigger_type = @trigger_type,
      trigger_config = @trigger_config,
      secrets = @secrets,
      enabled = @enabled,
      updated_at = datetime('now')
  WHERE id = @id
`);

const deleteActionStmt = db.prepare(`DELETE FROM actions WHERE id = ?`);
const getActionStmt = db.prepare(`SELECT * FROM actions WHERE id = ?`);
const listActionsStmt = db.prepare(`SELECT * FROM actions ORDER BY created_at DESC`);
const getEnabledActionsStmt = db.prepare(`SELECT * FROM actions WHERE enabled = 1`);

const insertLog = db.prepare(`
  INSERT INTO action_logs (action_id, duration_ms, success, stdout, stderr, trigger_data)
  VALUES (@action_id, @duration_ms, @success, @stdout, @stderr, @trigger_data)
`);

const getLogsStmt = db.prepare(`
  SELECT * FROM action_logs
  WHERE action_id = ?
  ORDER BY triggered_at DESC
  LIMIT ? OFFSET ?
`);

const getLogsCountStmt = db.prepare(`
  SELECT COUNT(*) as count FROM action_logs WHERE action_id = ?
`);

const updateStorageStmt = db.prepare(`
  UPDATE actions SET storage = ? WHERE id = ?
`);

const getTodayExecutionsStmt = db.prepare(`
  SELECT COUNT(*) as count FROM action_logs
  WHERE triggered_at >= date('now')
`);

// ---------------------------------------------------------------------------
// CRUD functions
// ---------------------------------------------------------------------------
export function createAction(data: {
  name: string;
  code: string;
  trigger_type: string;
  trigger_config: string;
  secrets?: string;
}): ActionRow {
  const result = insertAction.run({
    name: data.name,
    code: data.code,
    trigger_type: data.trigger_type,
    trigger_config: data.trigger_config,
    secrets: data.secrets ?? "{}",
  });
  return getActionStmt.get(result.lastInsertRowid) as ActionRow;
}

export function getAction(id: number): ActionRow | undefined {
  return getActionStmt.get(id) as ActionRow | undefined;
}

export function listActions(): ActionRow[] {
  return listActionsStmt.all() as ActionRow[];
}

export function getEnabledActions(): ActionRow[] {
  return getEnabledActionsStmt.all() as ActionRow[];
}

export function updateAction(
  id: number,
  data: {
    name: string;
    code: string;
    trigger_type: string;
    trigger_config: string;
    secrets: string;
    enabled: number;
  },
): ActionRow | undefined {
  const existing = getActionStmt.get(id) as ActionRow | undefined;
  if (!existing) return undefined;
  updateActionStmt.run({ ...data, id });
  return getActionStmt.get(id) as ActionRow;
}

export function deleteAction(id: number): boolean {
  const result = deleteActionStmt.run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Storage functions (per-action key-value store)
// ---------------------------------------------------------------------------
export function getActionStorage(id: number): Record<string, unknown> {
  const action = getActionStmt.get(id) as ActionRow | undefined;
  if (!action) return {};
  try {
    return JSON.parse(action.storage) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function setActionStorage(id: number, storage: Record<string, unknown>): void {
  updateStorageStmt.run(JSON.stringify(storage), id);
}

// ---------------------------------------------------------------------------
// Log functions
// ---------------------------------------------------------------------------
export function addLog(data: {
  action_id: number;
  duration_ms: number;
  success: number;
  stdout: string;
  stderr: string;
  trigger_data: string;
}): void {
  insertLog.run(data);
}

export function getActionLogs(
  actionId: number,
  page: number = 1,
  limit: number = 20,
): { rows: ActionLogRow[]; total: number; page: number; limit: number } {
  const offset = (page - 1) * limit;
  const rows = getLogsStmt.all(actionId, limit, offset) as ActionLogRow[];
  const { count } = getLogsCountStmt.get(actionId) as { count: number };
  return { rows, total: count, page, limit };
}

export function getTodayExecutions(): number {
  const { count } = getTodayExecutionsStmt.get() as { count: number };
  return count;
}

// ---------------------------------------------------------------------------
// Export db for advanced usage
// ---------------------------------------------------------------------------
export { db as actionsDb };
export default db;
