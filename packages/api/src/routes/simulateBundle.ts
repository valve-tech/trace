import { Router, type Request, type Response } from "express";
import { simulateBundleRequestSchema, type SimulateRequest } from "../types.js";
import { simulateBundle } from "../services/simulator.js";
import { asyncRoute, respond } from "../lib/respond.js";
import { resolveChainIdParam } from "../lib/chainParam.js";
import { runWithChain } from "../services/chains/context.js";

const router = Router();

/**
 * POST /api/simulate-bundle
 *
 * Simulate an ordered bundle of transactions against the requested chain
 * (`chainid` query/body, default 369 — the whole bundle runs on ONE chain;
 * per-transaction `chainid` fields are ignored). Each transaction's state
 * overrides are merged cumulatively so that side-effects compose across
 * the bundle.
 */
router.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = simulateBundleRequestSchema.parse(req.body);
    const chainId = resolveChainIdParam(req.query.chainid ?? parsed.chainid);

    const results = await runWithChain(chainId, () =>
      simulateBundle(
        parsed.transactions as SimulateRequest[],
        parsed.blockNumber as string | number | undefined,
      ),
    );

    // BigInt -> string for JSON serialisation.
    const payload = results.map((r) => ({
      ...r,
      gasEstimate: r.gasEstimate?.toString() ?? null,
    }));

    respond.ok(res, {
      chainid: chainId,
      blockNumber: parsed.blockNumber ?? null,
      results: payload,
    });
  }, "simulate-bundle"),
);

export default router;
