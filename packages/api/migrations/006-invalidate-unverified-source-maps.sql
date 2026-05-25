-- Source maps cached before the opcode-structure gate (see
-- services/solcCompiler/compileForSourceMap.ts) were generated from
-- recompiled bytecode that did not match the deployed bytecode, so their
-- PC -> source mappings are misaligned. Clear them once so they recompute
-- under the gate (which only keeps a map when the recompiled opcode
-- structure matches on-chain). Verified source itself is kept; only the
-- derived source_map + deployed_bytecode are cleared.
UPDATE verified_sources
SET source_map = NULL,
    deployed_bytecode = NULL
WHERE source_map IS NOT NULL;
