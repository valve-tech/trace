import { pool } from "../pool.js";
import { currentChainId } from "../chains/context.js";
import type { SlitherFinding, SlitherResult } from "./types.js";

/**
 * Slither runs are expensive (~30-60s per contract via Docker) and the
 * source is immutable on a verified contract, so results cache forever
 * by (chain_id, lowercase address) — the same address can hold different
 * code on different chains. Each row carries findings + duration + error
 * (null on success) and the timestamp.
 */
export async function getCachedResult(
  address: string,
): Promise<SlitherResult | null> {
  const { rows } = await pool.query<{
    address: string;
    findings: SlitherFinding[];
    detector_count: number;
    duration_ms: number;
    error: string | null;
    analyzed_at: string;
  }>(
    `SELECT * FROM slither_results
     WHERE chain_id = $2 AND LOWER(address) = LOWER($1)
     ORDER BY analyzed_at DESC LIMIT 1`,
    [address, currentChainId()],
  );

  if (!rows[0]) return null;
  const r = rows[0];
  return {
    address: r.address,
    findings: r.findings,
    detectorCount: r.detector_count,
    durationMs: r.duration_ms,
    error: r.error,
    analyzedAt: r.analyzed_at,
  };
}

export async function cacheResult(result: SlitherResult): Promise<void> {
  await pool.query(
    `INSERT INTO slither_results (address, chain_id, findings, detector_count, duration_ms, error)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
    [
      result.address.toLowerCase(),
      currentChainId(),
      JSON.stringify(result.findings),
      result.detectorCount,
      result.durationMs,
      result.error,
    ],
  );
}
