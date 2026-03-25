import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import { simulateRequestSchema } from "../types.js";
import { simulateTransaction } from "../services/simulator.js";

const router = Router();

/**
 * POST /api/simulate
 *
 * Simulate a single transaction against PulseChain.
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    // ---- Validate input ----
    const parsed = simulateRequestSchema.parse(req.body);

    // ---- Run simulation ----
    const result = await simulateTransaction(parsed);

    // BigInt is not JSON-serialisable, so convert gas estimate.
    const payload = {
      ...result,
      gasEstimate: result.gasEstimate?.toString() ?? null,
    };

    res.json({ ok: true, result: payload });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({
        ok: false,
        error: "Validation error",
        details: err.errors,
      });
      return;
    }

    console.error("[simulate] unexpected error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

export default router;
