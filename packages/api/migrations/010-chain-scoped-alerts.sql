-- Chain-scope alerts. An alert belongs to exactly one chain: the monitor
-- evaluates it against that chain's blocks, and the list endpoint filters by
-- it. Pre-multichain rows were all PulseChain (369), so the backfill default
-- is exact, not a guess (same rationale as 009-chain-scoped-caches.sql).

ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT 369;

-- The monitor's hot query is "enabled alerts for chain N" once per block.
CREATE INDEX IF NOT EXISTS idx_alerts_chain_enabled
  ON alerts(chain_id, enabled);
