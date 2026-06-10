import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { forkSimulate, simulateFromTxHash } from "../services/forkSimulator.js";
import { asyncRoute, respond } from "../lib/respond.js";
import { resolveChainIdParam } from "../lib/chainParam.js";
import { runWithChain } from "../services/chains/context.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Target chain — resolved + registry-checked by `resolveChainIdParam`. */
const chainidField = z.coerce.number().int().positive().optional();

const forkSimulateSchema = z.object({
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid from address"),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid to address"),
  value: z.string().optional(),
  data: z.string().optional(),
  blockNumber: z.number().int().nonnegative().optional(),
  gasLimit: z.number().int().positive().optional(),
  chainid: chainidField,
});

const fromHashSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash"),
  chainid: chainidField,
});

// ---------------------------------------------------------------------------
// POST /api/simulate/fork — Fork-based simulation with state diffs
//
// `chainid` (query/body, default 369) picks which chain the anvil fork's
// upstream points at — forkManager.createFork reads the active chain
// context, so the runWithChain wrapper routes the spawn correctly.
// ---------------------------------------------------------------------------
router.post(
  "/fork",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = forkSimulateSchema.parse(req.body);
    const chainId = resolveChainIdParam(req.query.chainid ?? parsed.chainid);
    const result = await runWithChain(chainId, () => forkSimulate(parsed));
    respond.ok(res, { chainid: chainId, result });
  }, "fork-simulate"),
);

// ---------------------------------------------------------------------------
// POST /api/simulate/from-hash — Re-simulate a mined transaction on a fork
// of the chain it was mined on (`chainid` query/body, default 369).
// ---------------------------------------------------------------------------
router.post(
  "/from-hash",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = fromHashSchema.parse(req.body);
    const chainId = resolveChainIdParam(req.query.chainid ?? parsed.chainid);
    const result = await runWithChain(chainId, () =>
      simulateFromTxHash(parsed.txHash),
    );
    respond.ok(res, { chainid: chainId, result, originalTxHash: parsed.txHash });
  }, "from-hash"),
);

export default router;
