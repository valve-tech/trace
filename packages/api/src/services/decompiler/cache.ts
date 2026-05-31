import { createHash } from "node:crypto";
import { pool } from "../pool.js";
import type {
  DecompiledContract,
  DecompiledStorageSlot,
} from "./heimdall.js";

/**
 * Cache for heimdall decompilation results. Keyed on the bytecode's
 * sha256 hash so the same bytecode at different addresses / chains
 * reuses one entry, and a proxy upgrade that swaps bytecode
 * automatically misses (hash changes).
 *
 * Pure data layer: the cache doesn't know how the value was computed
 * or how long it took. The caller times heimdall and passes
 * duration_ms / heimdall_version through here for diagnostic columns.
 */

/**
 * Compute the canonical cache key for a piece of deployed bytecode —
 * sha256 of the hex characters after the 0x prefix, lowercased. Stable
 * across hex casing and prefix presence.
 */
export function bytecodeCacheKey(bytecode: string): string {
  const stripped = bytecode.startsWith("0x")
    ? bytecode.slice(2)
    : bytecode;
  return createHash("sha256").update(stripped.toLowerCase()).digest("hex");
}

interface CachedRow {
  slots: DecompiledStorageSlot[];
  pseudo_source: string | null;
  inferred_abi: unknown[] | null;
}

/**
 * Look up a previously-computed decompilation by bytecode hash.
 * Returns null on a miss; rebuilds the DecompiledContract shape on hit
 * so the caller doesn't need to know the row schema.
 */
export async function getCachedDecompilation(
  bytecode: string,
): Promise<DecompiledContract | null> {
  const key = bytecodeCacheKey(bytecode);
  const { rows } = await pool.query<CachedRow>(
    "SELECT slots, pseudo_source, inferred_abi FROM decompiled_contracts WHERE bytecode_hash = $1",
    [key],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    hasLayout: row.slots.length > 0,
    slots: row.slots,
    pseudoSource: row.pseudo_source,
    inferredAbi: Array.isArray(row.inferred_abi)
      ? (row.inferred_abi as unknown[])
      : null,
  };
}

/**
 * Persist a heimdall decompilation. UPSERT on the bytecode hash so a
 * re-run replaces the row rather than failing the unique index — useful
 * when the operator upgrades heimdall and we want to recompute.
 */
export async function cacheDecompilation(
  bytecode: string,
  result: DecompiledContract,
  meta: { durationMs?: number; heimdallVersion?: string | null } = {},
): Promise<void> {
  const key = bytecodeCacheKey(bytecode);
  await pool.query(
    `INSERT INTO decompiled_contracts
       (bytecode_hash, slots, pseudo_source, inferred_abi, duration_ms, heimdall_version)
     VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, $6)
     ON CONFLICT (bytecode_hash) DO UPDATE SET
       slots = EXCLUDED.slots,
       pseudo_source = EXCLUDED.pseudo_source,
       inferred_abi = EXCLUDED.inferred_abi,
       duration_ms = EXCLUDED.duration_ms,
       heimdall_version = EXCLUDED.heimdall_version,
       decompiled_at = NOW()`,
    [
      key,
      JSON.stringify(result.slots),
      result.pseudoSource,
      result.inferredAbi ? JSON.stringify(result.inferredAbi) : null,
      meta.durationMs ?? 0,
      meta.heimdallVersion ?? null,
    ],
  );
}
