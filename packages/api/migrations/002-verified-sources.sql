-- Verified source code cache

CREATE TABLE IF NOT EXISTS verified_sources (
  id SERIAL PRIMARY KEY,
  address TEXT NOT NULL,
  chain_source TEXT NOT NULL DEFAULT 'blockscout',
  contract_name TEXT,
  compiler_version TEXT,
  optimization_used BOOLEAN DEFAULT FALSE,
  optimization_runs INTEGER,
  source_files JSONB NOT NULL DEFAULT '[]',
  abi JSONB NOT NULL DEFAULT '[]',
  source_map TEXT,
  deployed_bytecode TEXT,
  constructor_args TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_verified_sources_address
  ON verified_sources(LOWER(address));

-- Slither analysis results cache

CREATE TABLE IF NOT EXISTS slither_results (
  id SERIAL PRIMARY KEY,
  address TEXT NOT NULL,
  findings JSONB NOT NULL DEFAULT '[]',
  detector_count INTEGER NOT NULL DEFAULT 0,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_slither_results_address
  ON slither_results(LOWER(address));
