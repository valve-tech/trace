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

const DB_PATH = path.join(dataDir, "pulsedev.db");

// ---------------------------------------------------------------------------
// Initialize database
// ---------------------------------------------------------------------------
const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Schema setup
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('address_activity', 'contract_event', 'function_call', 'balance_threshold', 'failed_tx')),
    conditions TEXT NOT NULL DEFAULT '{}',
    notifications TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    cooldown_seconds INTEGER NOT NULL DEFAULT 60,
    last_triggered_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alert_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
    tx_hash TEXT,
    block_number INTEGER,
    matched_data TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_alert_history_alert_id ON alert_history(alert_id);
  CREATE INDEX IF NOT EXISTS idx_alert_history_triggered_at ON alert_history(triggered_at);
`);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AlertRow {
  id: number;
  name: string;
  type: string;
  conditions: string;
  notifications: string;
  enabled: number;
  cooldown_seconds: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertHistoryRow {
  id: number;
  alert_id: number;
  triggered_at: string;
  tx_hash: string | null;
  block_number: number | null;
  matched_data: string;
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------
const insertAlert = db.prepare(`
  INSERT INTO alerts (name, type, conditions, notifications, enabled, cooldown_seconds)
  VALUES (@name, @type, @conditions, @notifications, @enabled, @cooldown_seconds)
`);

const updateAlert = db.prepare(`
  UPDATE alerts
  SET name = @name,
      type = @type,
      conditions = @conditions,
      notifications = @notifications,
      enabled = @enabled,
      cooldown_seconds = @cooldown_seconds,
      updated_at = datetime('now')
  WHERE id = @id
`);

const deleteAlert = db.prepare(`DELETE FROM alerts WHERE id = ?`);
const getAlert = db.prepare(`SELECT * FROM alerts WHERE id = ?`);
const listAlerts = db.prepare(`SELECT * FROM alerts ORDER BY created_at DESC`);

const insertHistory = db.prepare(`
  INSERT INTO alert_history (alert_id, tx_hash, block_number, matched_data)
  VALUES (@alert_id, @tx_hash, @block_number, @matched_data)
`);

const getHistory = db.prepare(`
  SELECT * FROM alert_history
  WHERE alert_id = ?
  ORDER BY triggered_at DESC
  LIMIT ? OFFSET ?
`);

const getHistoryCount = db.prepare(`
  SELECT COUNT(*) as count FROM alert_history WHERE alert_id = ?
`);

const updateLastTriggered = db.prepare(`
  UPDATE alerts SET last_triggered_at = datetime('now') WHERE id = ?
`);

const getTriggeredTodayCount = db.prepare(`
  SELECT COUNT(*) as count FROM alert_history
  WHERE triggered_at >= date('now')
`);

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------
export function createAlert(data: {
  name: string;
  type: string;
  conditions: string;
  notifications: string;
  enabled: number;
  cooldown_seconds: number;
}): AlertRow {
  const result = insertAlert.run(data);
  return getAlert.get(result.lastInsertRowid) as AlertRow;
}

export function updateAlertById(
  id: number,
  data: {
    name: string;
    type: string;
    conditions: string;
    notifications: string;
    enabled: number;
    cooldown_seconds: number;
  },
): AlertRow | undefined {
  const existing = getAlert.get(id) as AlertRow | undefined;
  if (!existing) return undefined;
  updateAlert.run({ ...data, id });
  return getAlert.get(id) as AlertRow;
}

export function deleteAlertById(id: number): boolean {
  const result = deleteAlert.run(id);
  return result.changes > 0;
}

export function getAlertById(id: number): AlertRow | undefined {
  return getAlert.get(id) as AlertRow | undefined;
}

export function getAllAlerts(): AlertRow[] {
  return listAlerts.all() as AlertRow[];
}

export function getEnabledAlerts(): AlertRow[] {
  return (
    db.prepare(`SELECT * FROM alerts WHERE enabled = 1`).all() as AlertRow[]
  );
}

export function recordAlertTrigger(data: {
  alert_id: number;
  tx_hash: string | null;
  block_number: number | null;
  matched_data: string;
}): void {
  insertHistory.run(data);
  updateLastTriggered.run(data.alert_id);
}

export function getAlertHistory(
  alertId: number,
  limit: number = 20,
  offset: number = 0,
): { rows: AlertHistoryRow[]; total: number } {
  const rows = getHistory.all(alertId, limit, offset) as AlertHistoryRow[];
  const { count } = getHistoryCount.get(alertId) as { count: number };
  return { rows, total: count };
}

export function getTriggeredToday(): number {
  const { count } = getTriggeredTodayCount.get() as { count: number };
  return count;
}

export { db };
export default db;
