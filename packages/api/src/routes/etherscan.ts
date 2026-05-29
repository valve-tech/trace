/**
 * Etherscan-shaped API surface. Mounted at the bare `/api` path so
 * existing REST routes (`/api/tx/:hash`, `/api/source/:address`, …)
 * coexist without collision — Express routes both GET and POST on the
 * exact path to the dispatcher below.
 *
 * The dispatcher lives in `./etherscan/dispatcher.ts`; this file is
 * intentionally thin so the Express wiring is easy to read at a glance.
 */

import { Router } from "express";
import { asyncRoute } from "../lib/respond.js";
import { handleEtherscan } from "./etherscan/dispatcher.js";

const router = Router();

router.get("/", asyncRoute(handleEtherscan, "etherscan"));
router.post("/", asyncRoute(handleEtherscan, "etherscan"));

export default router;
