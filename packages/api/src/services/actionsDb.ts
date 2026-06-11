import { pool } from "./pool.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ActionRow {
  id: number;
  name: string;
  code: string;
  /** EIP-155 chain the action is pinned to (block/event feed + child RPC). */
  chain_id: number;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  secrets: Record<string, unknown>;
  storage: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActionLogRow {
  id: number;
  action_id: number;
  triggered_at: string;
  duration_ms: number;
  success: boolean;
  stdout: string;
  stderr: string;
  trigger_data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Actions CRUD
// ---------------------------------------------------------------------------
export async function createAction(data: {
  name: string;
  code: string;
  chain_id: number;
  trigger_type: string;
  trigger_config: string;
  secrets?: string;
}): Promise<ActionRow> {
  const { rows } = await pool.query<ActionRow>(
    `INSERT INTO actions (name, code, chain_id, trigger_type, trigger_config, secrets)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     RETURNING *`,
    [data.name, data.code, data.chain_id, data.trigger_type, data.trigger_config, data.secrets ?? "{}"],
  );
  return rows[0]!;
}

export async function getAction(id: number): Promise<ActionRow | undefined> {
  const { rows } = await pool.query<ActionRow>("SELECT * FROM actions WHERE id = $1", [id]);
  return rows[0];
}

export async function listActions(chainId: number): Promise<ActionRow[]> {
  const { rows } = await pool.query<ActionRow>(
    "SELECT * FROM actions WHERE chain_id = $1 ORDER BY created_at DESC",
    [chainId],
  );
  return rows;
}

/**
 * Enabled periodic actions across ALL chains — the scheduler registers
 * every one at boot regardless of chain (the chain only shapes the trigger
 * event payload and the RPC the executor hands to user code).
 */
export async function getEnabledPeriodicActions(): Promise<ActionRow[]> {
  const { rows } = await pool.query<ActionRow>(
    "SELECT * FROM actions WHERE enabled = TRUE AND trigger_type = 'periodic'",
  );
  return rows;
}

/**
 * Enabled actions on `chainId` whose trigger needs the block feed. The
 * monitor calls this once per block to decide whether fetching the block is
 * worth it at all (chains with neither alerts nor block/event actions cost
 * no RPC), then hands the rows straight to the scheduler so the query isn't
 * repeated.
 */
export async function getEnabledBlockEventActions(chainId: number): Promise<ActionRow[]> {
  const { rows } = await pool.query<ActionRow>(
    `SELECT * FROM actions
     WHERE enabled = TRUE AND chain_id = $1 AND trigger_type IN ('block', 'event')`,
    [chainId],
  );
  return rows;
}

export async function updateAction(
  id: number,
  data: {
    name: string;
    code: string;
    chain_id: number;
    trigger_type: string;
    trigger_config: string;
    secrets: string;
    enabled: boolean;
  },
): Promise<ActionRow | undefined> {
  const { rows } = await pool.query<ActionRow>(
    `UPDATE actions
     SET name = $1, code = $2, chain_id = $3, trigger_type = $4, trigger_config = $5::jsonb,
         secrets = $6::jsonb, enabled = $7, updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [data.name, data.code, data.chain_id, data.trigger_type, data.trigger_config, data.secrets, data.enabled, id],
  );
  return rows[0];
}

export async function deleteAction(id: number): Promise<boolean> {
  const { rowCount } = await pool.query("DELETE FROM actions WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Storage (per-action key-value store)
// ---------------------------------------------------------------------------
export async function getActionStorage(id: number): Promise<Record<string, unknown>> {
  const { rows } = await pool.query<{ storage: Record<string, unknown> }>(
    "SELECT storage FROM actions WHERE id = $1",
    [id],
  );
  return rows[0]?.storage ?? {};
}

export async function setActionStorage(id: number, storage: Record<string, unknown>): Promise<void> {
  await pool.query("UPDATE actions SET storage = $1::jsonb WHERE id = $2", [JSON.stringify(storage), id]);
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------
export async function addLog(data: {
  action_id: number;
  duration_ms: number;
  success: boolean;
  stdout: string;
  stderr: string;
  trigger_data: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO action_logs (action_id, duration_ms, success, stdout, stderr, trigger_data)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [data.action_id, data.duration_ms, data.success, data.stdout, data.stderr, data.trigger_data],
  );
}

export async function getActionLogs(
  actionId: number,
  page: number = 1,
  limit: number = 20,
): Promise<{ rows: ActionLogRow[]; total: number; page: number; limit: number }> {
  const offset = (page - 1) * limit;
  const [dataResult, countResult] = await Promise.all([
    pool.query<ActionLogRow>(
      "SELECT * FROM action_logs WHERE action_id = $1 ORDER BY triggered_at DESC LIMIT $2 OFFSET $3",
      [actionId, limit, offset],
    ),
    pool.query<{ count: string }>("SELECT COUNT(*) as count FROM action_logs WHERE action_id = $1", [actionId]),
  ]);
  return { rows: dataResult.rows, total: Number(countResult.rows[0]!.count), page, limit };
}

export async function getTodayExecutions(chainId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM action_logs l
     JOIN actions a ON a.id = l.action_id
     WHERE l.triggered_at >= CURRENT_DATE AND a.chain_id = $1`,
    [chainId],
  );
  return Number(rows[0]!.count);
}

export { pool as actionsDb };
export default pool;
