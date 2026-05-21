import { z } from "zod";

/** POST /api/source/:address/map — Map an array of program counters
 *  to source locations. Capped at 100k entries. */
export const mapPcsSchema = z.object({
  pcs: z
    .array(z.number().int().nonnegative())
    .min(1, "pcs must be a non-empty array")
    .max(100_000, "Too many PCs (max 100,000)"),
});

/** POST /api/source/:address/analyze — Run Slither static analysis. */
export const analyzeSchema = z.object({
  skipCache: z.boolean().optional(),
});
