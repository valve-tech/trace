import type { Request, Response, NextFunction } from "express";
import {
  SESSION_COOKIE_NAME,
  verifySession,
  type SessionPayload,
} from "./sessions.js";

/**
 * Express middleware that attaches the verified session to req.session OR
 * responds with 401 if no valid session cookie is present. Mount on any
 * route that requires "the caller proved ownership of an address".
 *
 * Cookie parsing is inlined (no cookie-parser dep). The cookie header
 * format is unambiguous for our single cookie name — split on `; `, then
 * look for `${name}=`.
 */

declare module "express-serve-static-core" {
  interface Request {
    session?: SessionPayload;
  }
}

export function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    res.status(401).json({ ok: false, error: "Not signed in" });
    return;
  }
  const token = readCookie(cookieHeader, SESSION_COOKIE_NAME);
  if (!token) {
    res.status(401).json({ ok: false, error: "Not signed in" });
    return;
  }
  const session = verifySession(token);
  if (!session) {
    res.status(401).json({ ok: false, error: "Session expired or invalid" });
    return;
  }
  req.session = session;
  next();
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return null;
}
