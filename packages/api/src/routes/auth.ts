import { Router, type Request, type Response } from "express";
import { verifyAuthSignature } from "@valve-tech/auth-lite";
import { z } from "zod";
import { isAddress, type Address, type Hex } from "viem";
import { ApiError, asyncRoute, respond } from "../lib/respond.js";
import { sessionCookieSecurity } from "../lib/cors.js";
import { issueNonce, consumeNonce } from "../services/auth/nonceStore.js";
import {
  mintSession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_SECONDS,
} from "../services/auth/sessions.js";

const router = Router();

const APP_ID = "explore";

const verifyBodySchema = z.object({
  address: z.string().refine(isAddress, "must be an EIP-55 address"),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, "must be 0x-prefixed hex"),
  nonce: z.string().min(1),
});

/**
 * GET /api/auth/nonce — issue a fresh nonce for the SIWE-lite challenge.
 *
 * Response: { ok: true, nonce, expiresAt }
 *
 * The client signs `formatAuthMessage({ app: APP_ID, nonce })` and POSTs to
 * /verify with the signature + address.
 */
router.get(
  "/nonce",
  asyncRoute(async (_req: Request, res: Response) => {
    const { nonce, expiresAt } = await issueNonce();
    respond.ok(res, { nonce, expiresAt });
  }, "auth/nonce"),
);

/**
 * POST /api/auth/verify — consume nonce, verify signature, mint session.
 *
 * Body: { address, signature, nonce }
 * Response: { ok: true, address } (session cookie set as side effect)
 *
 * Failure modes:
 *  - 400  malformed body (zod)
 *  - 401  bad signature OR address mismatch OR nonce unknown / already used / expired
 *
 * The nonce + signature failures all collapse to 401 with the same message —
 * a partially-truthful error response leaks which check failed, which is
 * exactly the kind of timing oracle to avoid for an auth primitive.
 */
router.post(
  "/verify",
  asyncRoute(async (req: Request, res: Response) => {
    const { address, signature, nonce } = verifyBodySchema.parse(req.body);

    // Consume FIRST so a failed signature check doesn't burn a nonce — if the
    // user hits a wallet bug and re-signs the same nonce, the second attempt
    // would otherwise see "nonce already used" even though the first was a
    // mis-signature. But we ALSO can't verify without the nonce being valid.
    // Compromise: validate the signature first, then consume the nonce
    // atomically. The verify is pure CPU; consume is the DB write.
    const recovered = await verifyAuthSignature({
      app: APP_ID,
      nonce,
      signature: signature as Hex,
      claimedAddress: address as Address,
    });
    if (!recovered) {
      throw new ApiError(401, "Authentication failed");
    }

    const consumed = await consumeNonce(nonce);
    if (!consumed) {
      throw new ApiError(401, "Authentication failed");
    }

    const { token, expiresAt } = mintSession(recovered);
    // SameSite/Secure depend on whether this is an allowlisted cross-origin
    // (IPFS gateway) request — None+Secure there so the cookie rides later
    // cross-origin sync calls; Lax for same-origin. See lib/cors.ts.
    const { sameSite, secure } = sessionCookieSecurity(req);
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite,
      secure,
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS * 1000,
      path: "/",
    });
    // Return the lowercased address to match the cookie payload's
    // normalization — clients comparing the response address to a stored
    // session shouldn't see a casing mismatch.
    respond.ok(res, { address: recovered.toLowerCase(), expiresAt });
  }, "auth/verify"),
);

/**
 * POST /api/auth/logout — clear the session cookie. Idempotent.
 */
router.post(
  "/logout",
  asyncRoute(async (req: Request, res: Response) => {
    // Clear with the SAME SameSite/Secure the cookie was set with, else a
    // cross-origin None+Secure cookie won't be cleared from a gateway origin.
    const { sameSite, secure } = sessionCookieSecurity(req);
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/", sameSite, secure });
    respond.ok(res);
  }, "auth/logout"),
);

export default router;
