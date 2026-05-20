import type { AlertRow } from "../../services/db.js";

/**
 * Pick the wire-format fields off an AlertRow. JSONB columns
 * (`conditions`, `notifications`) are already deserialized by pg so the
 * caller gets parsed objects rather than strings.
 */
export function formatAlertRow(row: AlertRow | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    conditions: row.conditions,
    notifications: row.notifications,
    enabled: row.enabled,
    cooldown_seconds: row.cooldown_seconds,
    last_triggered_at: row.last_triggered_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
