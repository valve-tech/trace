/**
 * Cross-origin policy for a self-hostable frontend.
 *
 * The SPA can be served from an IPFS gateway — a DIFFERENT origin than this API.
 * Read-only explorer requests must work from any origin (the whole point of a
 * gateway-portable frontend), but the cookie-bearing surfaces — SIWE-lite auth
 * and encrypted workspace sync — must be restricted to origins the operator has
 * explicitly vouched for, or any site could ride a logged-in user's session.
 *
 * So we run a SPLIT policy:
 *   - allowlisted origin → reflect it + `Access-Control-Allow-Credentials: true`
 *     (the session cookie is sent + accepted), and the session cookie is minted
 *     `SameSite=None; Secure` so the browser returns it on later cross-origin
 *     calls.
 *   - any other origin    → open read-only (`Access-Control-Allow-Origin: *`),
 *     no credentials. A credentialed request from here gets a wildcard ACAO,
 *     which browsers refuse to pair with credentials — so auth simply can't
 *     happen from an un-vouched origin.
 *
 * The allowlist is `CREDENTIALED_ORIGINS` (comma-separated, exact scheme+host+
 * port match on the Origin header). Empty by default: same-origin hosting needs
 * no entry, so the hosted deployment is unchanged.
 */

import type { Request } from "express";
import type { CorsOptions, CorsOptionsDelegate, CorsRequest } from "cors";

const CREDENTIALED_ORIGINS = new Set(
  (process.env.CREDENTIALED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

/** True when `origin` may make credentialed (cookie) cross-origin requests. */
export function isCredentialedOrigin(origin: string | undefined): boolean {
  return origin !== undefined && CREDENTIALED_ORIGINS.has(origin);
}

/**
 * Per-request CORS options: credentialed + origin-reflecting for the allowlist,
 * open read-only for everyone else. Pass straight to `cors(...)`.
 */
export const corsDelegate: CorsOptionsDelegate<CorsRequest> = (req, cb) => {
  const origin = req.headers.origin;
  const options: CorsOptions = isCredentialedOrigin(origin)
    ? { origin: true, credentials: true }
    : { origin: "*", credentials: false };
  cb(null, options);
};

/**
 * Session-cookie security attributes for the response to `req`. An allowlisted
 * cross-origin request needs `SameSite=None; Secure` so the cookie rides later
 * cross-origin calls (browsers require Secure for None). Same-origin keeps the
 * safer `SameSite=Lax`, Secure tracking production exactly as before.
 *
 * Use the SAME attributes when clearing the cookie — a `SameSite=None; Secure`
 * cookie won't be cleared by a `Lax` clear directive cross-origin.
 */
export function sessionCookieSecurity(req: Request): {
  sameSite: "none" | "lax";
  secure: boolean;
} {
  if (isCredentialedOrigin(req.headers.origin)) {
    return { sameSite: "none", secure: true };
  }
  return { sameSite: "lax", secure: process.env.NODE_ENV === "production" };
}
