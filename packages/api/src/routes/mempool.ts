/**
 * Mempool routes.
 *
 *   GET /api/mempool/pending — pending txs sorted by effective priority tip
 *                              (node inclusion order), with pending/queued
 *                              counts.
 *
 * Service: services/mempool.ts.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ApiError, asyncRoute, respond } from "../lib/respond.js";
import { getPendingTransactions } from "../services/mempool.js";
import { DEFAULT_CHAIN_ID, isSupportedChain } from "../services/chains/registry.js";

const router = Router();

const chainidQuery = z.object({
  chainid: z.coerce.number().int().positive().optional(),
});

router.get(
  "/pending",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = chainidQuery.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, "chainid must be a positive integer");
    }
    const chainId = parsed.data.chainid ?? DEFAULT_CHAIN_ID;
    if (!isSupportedChain(chainId)) {
      throw new ApiError(400, `Unsupported chainId: ${chainId}`);
    }
    const result = await getPendingTransactions(chainId);
    respond.ok(res, { result });
  }, "mempool/pending"),
);

export default router;
