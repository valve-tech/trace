/**
 * Routes backing the Explorer home view — Bundle 1 of EXPLORER_API_SPEC.
 *
 *   GET /api/latest/summary  — §2.1
 *   GET /api/blocks          — §2.2
 *   GET /api/txs/recent      — §2.3
 *
 * Service implementations live in `services/explorer/latest.ts`.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ApiError, asyncRoute, respond } from "../lib/respond.js";
import {
  getLatestSummary,
  getRecentBlocks,
  getRecentTxs,
} from "../services/explorer/latest.js";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/latest/summary
// ---------------------------------------------------------------------------

router.get(
  "/latest/summary",
  asyncRoute(async (_req: Request, res: Response) => {
    const summary = await getLatestSummary();
    respond.ok(res, { result: summary });
  }, "latest/summary"),
);

// ---------------------------------------------------------------------------
// GET /api/blocks?limit&before
// ---------------------------------------------------------------------------

const recentBlocksQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  /** Decimal block number — return blocks strictly older than this. */
  before: z
    .string()
    .regex(/^\d+$/, "before must be a decimal block number")
    .optional(),
});

router.get(
  "/blocks",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = recentBlocksQuery.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid query");
    }
    const result = await getRecentBlocks(parsed.data);
    respond.ok(res, { result });
  }, "explorer/blocks"),
);

// ---------------------------------------------------------------------------
// GET /api/txs/recent?limit
// ---------------------------------------------------------------------------

const recentTxsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

router.get(
  "/txs/recent",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = recentTxsQuery.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid query");
    }
    const result = await getRecentTxs(parsed.data.limit ?? 10);
    respond.ok(res, { result });
  }, "explorer/txs-recent"),
);

export default router;
