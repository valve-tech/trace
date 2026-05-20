import { pool } from "../pool.js";
import type { SourceFile, VerifiedSource } from "./types.js";

/**
 * Verified source rows live in `verified_sources`, keyed by lowercase
 * address. Reads return `null` on miss; writes use UPSERT so a
 * subsequent fetch refreshes `fetched_at`. JSONB columns
 * (source_files, abi) come back pre-deserialized from pg.
 */
export async function getCachedSource(
  address: string,
): Promise<VerifiedSource | null> {
  const { rows } = await pool.query<{
    address: string;
    chain_source: string;
    contract_name: string | null;
    compiler_version: string | null;
    optimization_used: boolean;
    optimization_runs: number | null;
    source_files: SourceFile[];
    abi: unknown[];
    source_map: string | null;
    deployed_bytecode: string | null;
  }>(
    "SELECT * FROM verified_sources WHERE LOWER(address) = LOWER($1)",
    [address],
  );

  if (!rows[0]) return null;

  const r = rows[0];
  return {
    address: r.address,
    chainSource: r.chain_source,
    contractName: r.contract_name,
    compilerVersion: r.compiler_version,
    optimizationUsed: r.optimization_used,
    optimizationRuns: r.optimization_runs,
    sourceFiles: r.source_files,
    abi: r.abi,
    sourceMap: r.source_map,
    deployedBytecode: r.deployed_bytecode,
  };
}

export async function cacheSource(source: VerifiedSource): Promise<void> {
  await pool.query(
    `INSERT INTO verified_sources
       (address, chain_source, contract_name, compiler_version, optimization_used,
        optimization_runs, source_files, abi, source_map, deployed_bytecode)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
     ON CONFLICT (LOWER(address)) DO UPDATE SET
       chain_source = $2, contract_name = $3, compiler_version = $4,
       optimization_used = $5, optimization_runs = $6, source_files = $7::jsonb,
       abi = $8::jsonb, source_map = $9, deployed_bytecode = $10,
       fetched_at = NOW()`,
    [
      source.address,
      source.chainSource,
      source.contractName,
      source.compilerVersion,
      source.optimizationUsed,
      source.optimizationRuns,
      JSON.stringify(source.sourceFiles),
      JSON.stringify(source.abi),
      source.sourceMap,
      source.deployedBytecode,
    ],
  );
}
