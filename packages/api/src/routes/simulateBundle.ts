import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import { simulateBundleRequestSchema, type SimulateRequest } from "../types.js";
import { simulateBundle } from "../services/simulator.js";

const router = Router();

/**
 * POST /api/simulate-bundle
 *
 * Simulate an ordered bundle of transactions against PulseChain.
 * Each transaction's state overrides are merged cumulatively so that
 * side-effects compose across the bundle.
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    // ---- Validate input ----
    const parsed = simulateBundleRequestSchema.parse(req.body);

    // ---- Run bundle simulation ----
    const results = await simulateBundle(
      parsed.transactions as SimulateRequest[],
      parsed.blockNumber as string | number | undefined,
    );

    // BigInt -> string for JSON serialisation.
    const payload = results.map((r) => ({
      ...r,
      gasEstimate: r.gasEstimate?.toString() ?? null,
    }));

    res.json({
      ok: true,
      blockNumber: parsed.blockNumber ?? null,
      results: payload,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({
        ok: false,
        error: "Validation error",
        details: err.errors,
      });
      return;
    }

    console.error("[simulate-bundle] unexpected error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

export default router;
