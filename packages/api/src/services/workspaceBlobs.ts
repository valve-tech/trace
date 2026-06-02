import { pool } from "./pool.js";

/**
 * Workspace sync blob store. Backend-side counterpart to the
 * WorkspaceSyncEnvelope wire shape defined in packages/web/src/lib/
 * workspace/sync.ts.
 *
 * The backend NEVER decrypts. It stores the envelope as opaque JSONB,
 * scoped to the recovered address (one blob per identity). Reads return
 * the most-recent envelope or null.
 *
 * Concurrency model: PUT replaces the row wholesale. Two clients writing
 * the same address from different devices both win in the order their
 * queries hit Postgres — the client's conflict-resolution prompt is what
 * mediates between "your local edits" and "what's now on the server".
 */

export interface SyncEnvelope {
  envelopeFormat: number;
  keyVersion: number;
  ciphertext: string;
  nonce: string;
  /** Client clock — used by the conflict layer, NOT trusted by the server. */
  updatedAt: number;
}

export interface StoredBlob extends SyncEnvelope {
  /** Server clock — authoritative timestamp of the last server-side write. */
  serverUpdatedAt: number;
}

/**
 * Lightweight runtime validation. We don't trust the client to give us a
 * well-formed envelope just because it has a session; bad input from a
 * compromised client could still poison its own blob, but we shouldn't
 * write arbitrary JSON shapes to the column.
 */
export function isSyncEnvelope(v: unknown): v is SyncEnvelope {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<SyncEnvelope>;
  return (
    typeof e.envelopeFormat === "number" &&
    typeof e.keyVersion === "number" &&
    typeof e.ciphertext === "string" &&
    typeof e.nonce === "string" &&
    typeof e.updatedAt === "number"
  );
}

const norm = (addr: string): string => addr.toLowerCase();

export async function getBlob(address: string): Promise<StoredBlob | null> {
  const result = await pool.query<{
    envelope: SyncEnvelope;
    server_updated_at: string;
  }>(
    `SELECT envelope, server_updated_at
       FROM workspace_blobs
      WHERE address = $1`,
    [norm(address)],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0]!;
  return {
    ...row.envelope,
    serverUpdatedAt: new Date(row.server_updated_at).getTime(),
  };
}

export async function putBlob(
  address: string,
  envelope: SyncEnvelope,
): Promise<{ serverUpdatedAt: number }> {
  const result = await pool.query<{ server_updated_at: string }>(
    `INSERT INTO workspace_blobs (address, envelope, server_updated_at)
          VALUES ($1, $2, NOW())
     ON CONFLICT (address) DO UPDATE
         SET envelope = EXCLUDED.envelope,
             server_updated_at = NOW()
      RETURNING server_updated_at`,
    [norm(address), envelope],
  );
  return {
    serverUpdatedAt: new Date(result.rows[0]!.server_updated_at).getTime(),
  };
}

export async function deleteBlob(address: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM workspace_blobs WHERE address = $1`,
    [norm(address)],
  );
  return (result.rowCount ?? 0) > 0;
}
