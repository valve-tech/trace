import { Router, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import { forkSimulate, simulateFromTxHash } from "../services/forkSimulator.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const forkSimulateSchema = z.object({
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid from address"),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid to address"),
  value: z.string().optional(),
  data: z.string().optional(),
  blockNumber: z.number().int().nonnegative().optional(),
  gasLimit: z.number().int().positive().optional(),
});

const fromHashSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash"),
});

// ---------------------------------------------------------------------------
// POST /api/simulate/fork — Fork-based simulation with state diffs
// ---------------------------------------------------------------------------
router.post("/fork", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = forkSimulateSchema.parse(req.body);
    const result = await forkSimulate(parsed);
    res.json({ ok: true, result });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ ok: false, error: "Validation error", details: err.errors });
      return;
    }

    const message = err instanceof Error ? err.message : "Fork simulation failed";
    const status = message.includes("Too many concurrent") ? 429 : 500;
    console.error("[fork-simulate] error:", err);
    res.status(status).json({ ok: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/simulate/from-hash — Re-simulate a mined transaction on a fork
// ---------------------------------------------------------------------------
router.post("/from-hash", async (req: Request, res: Response): Promise<void> => {
  try {
    const { txHash } = fromHashSchema.parse(req.body);
    const result = await simulateFromTxHash(txHash);
    res.json({ ok: true, result, originalTxHash: txHash });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ ok: false, error: "Validation error", details: err.errors });
      return;
    }

    const message = err instanceof Error ? err.message : "Simulation failed";
    console.error("[from-hash] error:", err);
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
