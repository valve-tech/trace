-- Heimdall decompiler result cache.
--
-- Keyed on bytecode hash, NOT address: same bytecode at different
-- addresses (or chains) decompiles identically, so one hash → one row
-- de-dupes the proxy/implementation case naturally. A proxy upgrade at
-- the same address that swaps bytecode automatically invalidates
-- because the hash changes.
--
-- `slots` is the canonical DecompiledStorageSlot[] shape (see
-- packages/api/src/services/decompiler/heimdall.ts). `pseudo_source` is
-- heimdall's reconstructed Solidity; `inferred_abi` is heimdall's ABI
-- guess. All three nullable — heimdall can produce any subset on a
-- given bytecode.

CREATE TABLE IF NOT EXISTS decompiled_contracts (
  id SERIAL PRIMARY KEY,
  bytecode_hash TEXT NOT NULL,
  slots JSONB NOT NULL DEFAULT '[]',
  pseudo_source TEXT,
  inferred_abi JSONB,
  /** Wall-clock duration of the heimdall invocation, ms. Diagnostic. */
  duration_ms INTEGER NOT NULL DEFAULT 0,
  /** Heimdall CLI version reported at compute time (`heimdall --version`).
      When the operator upgrades heimdall, old cached rows stay valid until
      something proves they aren't; we may invalidate by version in a future
      migration but don't gate reads on it today. */
  heimdall_version TEXT,
  decompiled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_decompiled_contracts_bytecode_hash
  ON decompiled_contracts(bytecode_hash);
