-- Cache for immutable trace results (mined transactions never change)

CREATE TABLE IF NOT EXISTS trace_cache (
  id SERIAL PRIMARY KEY,
  tx_hash TEXT NOT NULL,
  trace_type TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trace_cache_hash_type
  ON trace_cache(tx_hash, trace_type);
