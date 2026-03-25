CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  rate_limit INTEGER NOT NULL DEFAULT 100, -- requests per minute
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
