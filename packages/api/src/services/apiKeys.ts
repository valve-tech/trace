import crypto from "node:crypto";
import { pool } from "./pool.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKeyRecord {
  id: number;
  name: string;
  rateLimit: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreateResult {
  id: number;
  name: string;
  /** The plaintext key — returned only at creation time */
  key: string;
  createdAt: string;
}

export interface ApiKeyValidateResult {
  id: number;
  name: string;
  rateLimit: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a cryptographically random 32-byte hex string (64 hex chars). */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** SHA-256 hash of a plaintext key, returned as hex. */
export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new API key.
 * Stores only the hash; returns the plaintext key once (caller must save it).
 */
export async function createApiKey(name: string): Promise<ApiKeyCreateResult> {
  const key = generateApiKey();
  const keyHash = hashKey(key);

  const { rows } = await pool.query<{ id: number; name: string; created_at: string }>(
    `INSERT INTO api_keys (name, key_hash) VALUES ($1, $2) RETURNING id, name, created_at`,
    [name, keyHash],
  );

  const row = rows[0];
  if (!row) throw new Error("Insert returned no rows");

  return {
    id: row.id,
    name: row.name,
    key,
    createdAt: row.created_at,
  };
}

/**
 * Look up an API key by its plaintext value, update last_used_at, and return
 * the key metadata.  Returns null when the key is not found.
 */
export async function validateApiKey(key: string): Promise<ApiKeyValidateResult | null> {
  const keyHash = hashKey(key);

  const { rows } = await pool.query<{ id: number; name: string; rate_limit: number }>(
    `UPDATE api_keys
     SET last_used_at = NOW()
     WHERE key_hash = $1
     RETURNING id, name, rate_limit`,
    [keyHash],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    rateLimit: row.rate_limit,
  };
}

/**
 * List all API keys.  Hashes are never returned.
 */
export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const { rows } = await pool.query<{
    id: number;
    name: string;
    rate_limit: number;
    last_used_at: string | null;
    created_at: string;
  }>(`SELECT id, name, rate_limit, last_used_at, created_at FROM api_keys ORDER BY created_at DESC`);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    rateLimit: row.rate_limit,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  }));
}

/**
 * Delete an API key by id.  Returns true when a row was deleted.
 */
export async function deleteApiKey(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM api_keys WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
