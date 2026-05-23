/**
 * Routes backing token charting — see docs/CHARTING.md.
 *
 *   GET /api/chifra/transfers?token&window  — normalized transfer history
 *
 * Service implementation lives in services/chifra/.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ApiError, asyncRoute, respond } from "../lib/respond.js";
import { getTokenTransfers } from "../services/chifra/index.js";

const router = Router();

/** Chart windows → seconds. Keep in sync with the web window picker. */
const WINDOW_SECONDS: Record<string, number> = {
  "24h": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
};

const transfersQuery = z.object({
  token: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "token must be a 0x-prefixed address"),
  window: z.enum(["24h", "7d", "30d"]).default("24h"),
});

router.get(
  "/chifra/transfers",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = transfersQuery.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid query");
    }
    const { token, window } = parsed.data;
    const result = await getTokenTransfers(token, WINDOW_SECONDS[window]!);
    if (result === null) {
      throw new ApiError(502, "chifra upstream unavailable or returned no data");
    }
    respond.ok(res, { result });
  }, "chifra/transfers"),
);

export default router;
