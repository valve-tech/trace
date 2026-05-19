import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { forkSimulate, simulateFromTxHash } from "../services/forkSimulator.js";
import { asyncRoute, respond } from "../lib/respond.js";

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
router.post(
  "/fork",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = forkSimulateSchema.parse(req.body);
    const result = await forkSimulate(parsed);
    respond.ok(res, { result });
  }, "fork-simulate"),
);

// ---------------------------------------------------------------------------
// POST /api/simulate/from-hash — Re-simulate a mined transaction on a fork
// ---------------------------------------------------------------------------
router.post(
  "/from-hash",
  asyncRoute(async (req: Request, res: Response) => {
    const { txHash } = fromHashSchema.parse(req.body);
    const result = await simulateFromTxHash(txHash);
    respond.ok(res, { result, originalTxHash: txHash });
  }, "from-hash"),
);

export default router;
