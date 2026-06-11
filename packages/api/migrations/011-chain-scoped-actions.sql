-- Chain-scope Web3 Actions. An action belongs to exactly one chain: block/
-- event triggers fire from that chain's block feed, and the executor hands
-- user code that chain's RPC URL. Pre-multichain rows were all PulseChain
-- (369), so the backfill default is exact, not a guess (same rationale as
-- 010-chain-scoped-alerts.sql).

ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT 369;

-- The monitor's hot query is "enabled block/event actions for chain N" once
-- per block (it gates whether the block is fetched at all).
CREATE INDEX IF NOT EXISTS idx_actions_chain_enabled
  ON actions(chain_id, enabled);
