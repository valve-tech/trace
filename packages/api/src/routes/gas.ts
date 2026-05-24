/**
 * Gas oracle route — priority-fee tier recommendations.
 *
 *   GET /api/gas/oracle  — slow/standard/fast/instant tiers + base fee +
 *                          trend + mempool stats, mempool-influenced.
 *
 * Service: services/gasOracle.ts (one shared server-side poller).
 */

import { Router, type Request, type Response } from "express";
import { asyncRoute, respond } from "../lib/respond.js";
import { getGasTiers } from "../services/gasOracle.js";
import { serialize } from "../services/explorer/client.js";

const router = Router();

router.get(
  "/oracle",
  asyncRoute(async (_req: Request, res: Response) => {
    const state = await getGasTiers();
    respond.ok(res, { result: serialize(state) });
  }, "gas/oracle"),
);

export default router;
