import { Router, type Request, type Response } from "express";
import { simulateBundleRequestSchema, type SimulateRequest } from "../types.js";
import { simulateBundle } from "../services/simulator.js";
import { asyncRoute, respond } from "../lib/respond.js";

const router = Router();

/**
 * POST /api/simulate-bundle
 *
 * Simulate an ordered bundle of transactions against PulseChain.
 * Each transaction's state overrides are merged cumulatively so that
 * side-effects compose across the bundle.
 */
router.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = simulateBundleRequestSchema.parse(req.body);

    const results = await simulateBundle(
      parsed.transactions as SimulateRequest[],
      parsed.blockNumber as string | number | undefined,
    );

    // BigInt -> string for JSON serialisation.
    const payload = results.map((r) => ({
      ...r,
      gasEstimate: r.gasEstimate?.toString() ?? null,
    }));

    respond.ok(res, {
      blockNumber: parsed.blockNumber ?? null,
      results: payload,
    });
  }, "simulate-bundle"),
);

export default router;
