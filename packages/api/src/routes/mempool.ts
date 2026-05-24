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
import { asyncRoute, respond } from "../lib/respond.js";
import { getPendingTransactions } from "../services/mempool.js";

const router = Router();

router.get(
  "/pending",
  asyncRoute(async (_req: Request, res: Response) => {
    const result = await getPendingTransactions();
    respond.ok(res, { result });
  }, "mempool/pending"),
);

export default router;
