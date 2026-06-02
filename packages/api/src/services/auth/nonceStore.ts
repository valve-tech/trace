import { generateAuthNonce } from "@valve-tech/auth-lite";
import { pool } from "../pool.js";

/**
 * Postgres-backed nonce store for the SIWE-lite challenge flow.
 *
 * Two operations:
 *   issue()    — generate a nonce via auth-lite, persist with expiry, return it.
 *   consume()  — atomically validate + mark a nonce used. Returns true if the
 *                nonce was issued, unexpired, and unused; false otherwise.
 *                Both failure modes (not-found OR already-used OR expired)
 *                return false without distinguishing — clients can't tell from
 *                the response whether they hit a replay vs an expiry, which is
 *                the desired behaviour for an auth primitive.
 *
 * The nonce table is small (5min TTL, low write rate). A periodic vacuum to
 * drop rows where `expires_at < now() - interval '1 hour'` keeps it bounded;
 * not implemented here — would live in a cron worker alongside other cleanup.
 */

const NONCE_TTL_SECONDS = 5 * 60;

export async function issueNonce(): Promise<{ nonce: string; expiresAt: number }> {
  const { nonce, expiresAt } = generateAuthNonce({ ttlSeconds: NONCE_TTL_SECONDS });
  await pool.query(
    `INSERT INTO auth_nonces (nonce, expires_at) VALUES ($1, to_timestamp($2))`,
    [nonce, expiresAt / 1000],
  );
  return { nonce, expiresAt };
}

/**
 * Mark a nonce as used. Returns true ONLY when the row was unused AND
 * unexpired at the moment of the UPDATE — a concurrent verify on the same
 * nonce in a different connection sees `used_at IS NOT NULL` and fails.
 */
export async function consumeNonce(nonce: string): Promise<boolean> {
  const result = await pool.query<{ nonce: string }>(
    `UPDATE auth_nonces
        SET used_at = NOW()
      WHERE nonce = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING nonce`,
    [nonce],
  );
  return result.rowCount === 1;
}
