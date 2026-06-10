import { Router, type Request, type Response } from "express";
import { simulateRequestSchema } from "../types.js";
import { simulateTransaction } from "../services/simulator.js";
import { asyncRoute, respond } from "../lib/respond.js";
import { resolveChainIdParam } from "../lib/chainParam.js";
import { runWithChain } from "../services/chains/context.js";

const router = Router();

/**
 * POST /api/simulate
 *
 * Simulate a single transaction against the requested chain. `chainid`
 * (query param or body field, query wins) selects the chain; omitted
 * defaults to 369 (PulseChain) for backward compatibility, unsupported
 * ids are a 400. The handler re-enters the chain context explicitly so
 * the service's RPC reads target the validated chain.
 */
router.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = simulateRequestSchema.parse(req.body);
    const chainId = resolveChainIdParam(req.query.chainid ?? parsed.chainid);
    const result = await runWithChain(chainId, () =>
      simulateTransaction(parsed),
    );

    // BigInt is not JSON-serialisable, so convert gas estimate.
    const payload = {
      ...result,
      gasEstimate: result.gasEstimate?.toString() ?? null,
    };

    respond.ok(res, { chainid: chainId, result: payload });
  }, "simulate"),
);

export default router;
