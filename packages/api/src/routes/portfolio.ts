/**
 * Portfolio holdings route.
 *
 *   GET /api/portfolio/holdings?address=0x…&chainid=369
 *
 * Returns all token balances the holder owns — current amounts from the
 * balance_changes archive (storage-diff truth, no balanceOf), labelled with
 * chain metadata — plus the native balance. Service implementation lives in
 * services/portfolio/.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ApiError, asyncRoute, respond } from "../lib/respond.js";
import { isSupportedChain, DEFAULT_CHAIN_ID } from "../services/chains/registry.js";
import { getHoldings } from "../services/portfolio/holdings.js";

const router = Router();

const holdingsQuery = z.object({
  address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "address must be a 0x-prefixed 20-byte hex"),
  chainid: z.coerce.number().int().positive().optional(),
});

router.get(
  "/holdings",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = holdingsQuery.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid query");
    }
    const chainId = parsed.data.chainid ?? DEFAULT_CHAIN_ID;
    if (!isSupportedChain(chainId)) {
      throw new ApiError(400, `Unsupported chainId: ${chainId}`);
    }
    const result = await getHoldings(parsed.data.address, chainId);
    respond.ok(res, { result });
  }, "portfolio/holdings"),
);

export default router;
