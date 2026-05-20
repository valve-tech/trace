import { pool } from "../pool.js";
import type { CompilationResult } from "./types.js";

/**
 * Source map + deployed bytecode are cached on the `verified_sources`
 * row itself rather than in a separate table — they're 1:1 with the
 * source and small enough not to bloat the row.
 *
 * `storageLayout` isn't cached. It's bulky and the source-viewer is the
 * only consumer; recompile-on-demand is cheap enough for the storage
 * route's call rate.
 */
export async function getCachedCompilation(
  address: string,
): Promise<CompilationResult | null> {
  const { rows } = await pool.query<{
    source_map: string;
    deployed_bytecode: string;
  }>(
    "SELECT source_map, deployed_bytecode FROM verified_sources WHERE LOWER(address) = LOWER($1) AND source_map IS NOT NULL",
    [address],
  );
  if (!rows[0] || !rows[0].source_map) return null;
  return {
    sourceMap: rows[0].source_map,
    deployedBytecode: rows[0].deployed_bytecode,
    abi: [],
    contractName: "",
    storageLayout: null,
  };
}

export async function cacheCompilationResult(
  address: string,
  sourceMap: string,
  deployedBytecode: string,
): Promise<void> {
  await pool.query(
    "UPDATE verified_sources SET source_map = $1, deployed_bytecode = $2 WHERE LOWER(address) = LOWER($3)",
    [sourceMap, deployedBytecode, address],
  );
}
