import { pool, withTransaction } from "./pool.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AlertRow {
  id: number;
  name: string;
  type: string;
  /** EIP-155 chain id the alert watches (migration 010; legacy rows are 369). */
  chain_id: number;
  conditions: Record<string, unknown>;
  notifications: unknown[];
  enabled: boolean;
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
  matched_data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Alerts CRUD
// ---------------------------------------------------------------------------
export async function createAlert(data: {
  name: string;
  type: string;
  chain_id: number;
  conditions: string;
  notifications: string;
  enabled: boolean;
  cooldown_seconds: number;
}): Promise<AlertRow> {
  const { rows } = await pool.query<AlertRow>(
    `INSERT INTO alerts (name, type, chain_id, conditions, notifications, enabled, cooldown_seconds)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
     RETURNING *`,
    [data.name, data.type, data.chain_id, data.conditions, data.notifications, data.enabled, data.cooldown_seconds],
  );
  return rows[0]!;
}

export async function updateAlertById(
  id: number,
  data: {
    name: string;
    type: string;
    chain_id: number;
    conditions: string;
    notifications: string;
    enabled: boolean;
    cooldown_seconds: number;
  },
): Promise<AlertRow | undefined> {
  const { rows } = await pool.query<AlertRow>(
    `UPDATE alerts
     SET name = $1, type = $2, chain_id = $3, conditions = $4::jsonb, notifications = $5::jsonb,
         enabled = $6, cooldown_seconds = $7, updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [data.name, data.type, data.chain_id, data.conditions, data.notifications, data.enabled, data.cooldown_seconds, id],
  );
  return rows[0];
}

export async function deleteAlertById(id: number): Promise<boolean> {
  const { rowCount } = await pool.query("DELETE FROM alerts WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}

export async function getAlertById(id: number): Promise<AlertRow | undefined> {
  const { rows } = await pool.query<AlertRow>("SELECT * FROM alerts WHERE id = $1", [id]);
  return rows[0];
}

export async function getAllAlerts(chainId: number): Promise<AlertRow[]> {
  const { rows } = await pool.query<AlertRow>(
    "SELECT * FROM alerts WHERE chain_id = $1 ORDER BY created_at DESC",
    [chainId],
  );
  return rows;
}

export async function getEnabledAlerts(chainId: number): Promise<AlertRow[]> {
  const { rows } = await pool.query<AlertRow>(
    "SELECT * FROM alerts WHERE enabled = TRUE AND chain_id = $1",
    [chainId],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Alert history
// ---------------------------------------------------------------------------
export async function recordAlertTrigger(data: {
  alert_id: number;
  tx_hash: string | null;
  block_number: number | null;
  matched_data: string;
}): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO alert_history (alert_id, tx_hash, block_number, matched_data)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [data.alert_id, data.tx_hash, data.block_number, data.matched_data],
    );
    await client.query("UPDATE alerts SET last_triggered_at = NOW() WHERE id = $1", [data.alert_id]);
  });
}

export async function getAlertHistory(
  alertId: number,
  limit: number = 20,
  offset: number = 0,
): Promise<{ rows: AlertHistoryRow[]; total: number }> {
  const [dataResult, countResult] = await Promise.all([
    pool.query<AlertHistoryRow>(
      "SELECT * FROM alert_history WHERE alert_id = $1 ORDER BY triggered_at DESC LIMIT $2 OFFSET $3",
      [alertId, limit, offset],
    ),
    pool.query<{ count: string }>("SELECT COUNT(*) as count FROM alert_history WHERE alert_id = $1", [alertId]),
  ]);
  return { rows: dataResult.rows, total: Number(countResult.rows[0]!.count) };
}

export async function getTriggeredToday(chainId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count
       FROM alert_history h
       JOIN alerts a ON a.id = h.alert_id
      WHERE h.triggered_at >= CURRENT_DATE
        AND a.chain_id = $1`,
    [chainId],
  );
  return Number(rows[0]!.count);
}

export { pool };
export default pool;
