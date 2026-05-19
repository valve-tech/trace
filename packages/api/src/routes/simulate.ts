import { Router, type Request, type Response } from "express";
import { simulateRequestSchema } from "../types.js";
import { simulateTransaction } from "../services/simulator.js";
import { asyncRoute, respond } from "../lib/respond.js";

const router = Router();

/**
 * POST /api/simulate
 *
 * Simulate a single transaction against PulseChain.
 */
router.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = simulateRequestSchema.parse(req.body);
    const result = await simulateTransaction(parsed);

    // BigInt is not JSON-serialisable, so convert gas estimate.
    const payload = {
      ...result,
      gasEstimate: result.gasEstimate?.toString() ?? null,
    };

    respond.ok(res, { result: payload });
  }, "simulate"),
);

export default router;
