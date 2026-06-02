-- Workspace cloud-sync auth state.
--
-- Two tables:
--
--   auth_nonces    — pending + used nonces for the SIWE-lite challenge.
--                    Rows are inserted on GET /api/auth/nonce, marked
--                    used (used_at IS NOT NULL) on POST /api/auth/verify.
--                    Single-use; replay attempts reject. TTL enforced at
--                    insert via expires_at; old rows can be vacuumed by
--                    a periodic cleanup job (not yet built).
--
--   workspace_blobs — one ciphertext blob per address (a workspace owner
--                     has exactly one sync slot). Updated on PUT, read on
--                     GET. Replaced wholesale per write — workspaces are
--                     small enough (<10KB ciphertext) that diffing the
--                     blob would be more code than the read-amplification
--                     it saves.
--
-- Both tables live in plain Postgres; no extension dependencies.

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce       TEXT PRIMARY KEY,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires
  ON auth_nonces(expires_at);

CREATE TABLE IF NOT EXISTS workspace_blobs (
  -- Lowercased hex address (no 0x prefix stripping — we store 0x… so the
  -- column is human-readable in psql and joins cleanly with other
  -- address-keyed tables we may add later).
  address          TEXT PRIMARY KEY,
  -- The workspace sync envelope as a JSONB blob. Backend NEVER decrypts;
  -- the JSON structure is (ciphertext, nonce, envelopeFormat, keyVersion,
  -- updatedAt) — all opaque bytes plus a timestamp. JSONB chosen over BYTEA
  -- because the wire shape is already JSON and we don't gain anything by
  -- re-encoding.
  envelope         JSONB NOT NULL,
  -- Server-side last-write timestamp. Distinct from the envelope's own
  -- updatedAt: the conflict-resolution logic compares both — local vs
  -- envelope.updatedAt tells the client "your data vs. THIS device's last
  -- known state"; server_updated_at is for log + cleanup queries.
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
