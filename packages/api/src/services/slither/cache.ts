import { pool } from "../pool.js";
import type { SlitherFinding, SlitherResult } from "./types.js";

/**
 * Slither runs are expensive (~30-60s per contract via Docker) and the
 * source is immutable on a verified contract, so results cache forever
 * by lowercase address. Each row carries findings + duration + error
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
    "SELECT * FROM slither_results WHERE LOWER(address) = LOWER($1) ORDER BY analyzed_at DESC LIMIT 1",
    [address],
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
    `INSERT INTO slither_results (address, findings, detector_count, duration_ms, error)
     VALUES ($1, $2::jsonb, $3, $4, $5)`,
    [
      result.address.toLowerCase(),
      JSON.stringify(result.findings),
      result.detectorCount,
      result.durationMs,
      result.error,
    ],
  );
}
