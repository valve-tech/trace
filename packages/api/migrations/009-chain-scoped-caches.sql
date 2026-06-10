-- Chain-scope the address-keyed caches. Pre-multichain rows were all
-- PulseChain (369), so the backfill default is exact, not a guess.

ALTER TABLE verified_sources
  ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT 369;

DROP INDEX IF EXISTS idx_verified_sources_address;
CREATE UNIQUE INDEX IF NOT EXISTS idx_verified_sources_chain_address
  ON verified_sources(chain_id, LOWER(address));

ALTER TABLE slither_results
  ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT 369;

DROP INDEX IF EXISTS idx_slither_results_address;
CREATE INDEX IF NOT EXISTS idx_slither_results_chain_address
  ON slither_results(chain_id, LOWER(address));
