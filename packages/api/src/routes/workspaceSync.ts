import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ApiError, asyncRoute, respond } from "../lib/respond.js";
import { requireSession } from "../services/auth/middleware.js";
import {
  deleteBlob,
  getBlob,
  isSyncEnvelope,
  putBlob,
} from "../services/workspaceBlobs.js";

const router = Router();

const envelopeBodySchema = z.object({
  envelopeFormat: z.number().int().positive(),
  keyVersion: z.number().int().positive(),
  ciphertext: z.string().min(1),
  nonce: z.string().min(1),
  updatedAt: z.number().int(),
});

/**
 * GET /api/workspaces/sync
 *
 * Returns the most recent envelope for the authenticated address, or 404
 * if the user has never uploaded one. The backend never decrypts; the
 * envelope is returned verbatim along with the server's record of when
 * it landed.
 */
router.get(
  "/sync",
  requireSession,
  asyncRoute(async (req: Request, res: Response) => {
    const session = req.session!;
    const blob = await getBlob(session.address);
    if (!blob) {
      throw new ApiError(404, "No synced workspace blob");
    }
    // respond.ok wants a Record<string, unknown>; StoredBlob is shape-
    // compatible but has a closed interface. Cast through unknown so the
    // payload shape stays documented in StoredBlob while satisfying the
    // helper's index-signature constraint.
    respond.ok(res, blob as unknown as Record<string, unknown>);
  }, "workspaces/sync.get"),
);

/**
 * PUT /api/workspaces/sync
 *
 * Body: the WorkspaceSyncEnvelope from packages/web/src/lib/workspace/sync.ts.
 * Replaces the row wholesale. Returns the server-side timestamp the client
 * uses as the next "last known server state" for conflict detection.
 */
router.put(
  "/sync",
  requireSession,
  asyncRoute(async (req: Request, res: Response) => {
    const session = req.session!;
    const body = envelopeBodySchema.parse(req.body);
    // The zod parse already enforces the structure isSyncEnvelope would
    // check, but we keep the run-time guard call so the storage layer's
    // shape contract is documented + enforced regardless of how callers
    // reach it (e.g. a future internal-write path bypassing the route).
    if (!isSyncEnvelope(body)) {
      throw new ApiError(400, "Malformed envelope");
    }
    const { serverUpdatedAt } = await putBlob(session.address, body);
    respond.ok(res, { serverUpdatedAt });
  }, "workspaces/sync.put"),
);

/**
 * DELETE /api/workspaces/sync
 *
 * Drops the user's blob. Idempotent — returns 200 whether or not a row
 * existed (clients calling it as part of an account-wipe shouldn't have
 * to distinguish).
 */
router.delete(
  "/sync",
  requireSession,
  asyncRoute(async (req: Request, res: Response) => {
    const session = req.session!;
    const removed = await deleteBlob(session.address);
    respond.ok(res, { removed });
  }, "workspaces/sync.delete"),
);

export default router;
