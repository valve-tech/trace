import crypto from "node:crypto";

/**
 * HMAC-signed session tokens.
 *
 * Wire shape: `base64url(payload).base64url(signature)`
 *   payload   = JSON.stringify({ address, exp })
 *   signature = HMAC-SHA256(SESSION_SECRET, payload)
 *
 * No JWT, no JOSE, no rotation — for a 7-day session on a single-app product,
 * the JWT toolchain pays mostly in complexity (header / claim rules / key
 * negotiation) we don't need. HMAC-signed cookies cover the same threat model.
 *
 * SESSION_SECRET is read at module load. In production, MUST be set; if
 * missing, throw — silent acceptance of "no secret = random per process" would
 * let server restarts invalidate all sessions silently AND break
 * load-balanced multi-instance deployments.
 *
 * In dev, a `SESSION_SECRET=` placeholder generates a stable per-process value
 * so each `npm run dev:api` produces consistent tokens; the trade-off is
 * acceptable for local-only use.
 */

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SESSION_SECRET = resolveSessionSecret();

function resolveSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to >=32 characters in production",
    );
  }
  // Dev fallback — random per process. Sessions issued before a restart
  // will be unrecognized after, but that's OK for local-only use.
  const generated = crypto.randomBytes(32).toString("hex");
  console.warn(
    "[auth] SESSION_SECRET not set; using a random per-process value. " +
      "Set SESSION_SECRET in .env to persist sessions across restarts.",
  );
  return generated;
}

export interface SessionPayload {
  /** Lowercase 0x-prefixed address of the wallet that authenticated. */
  address: `0x${string}`;
  /** Expiry as ms epoch. */
  exp: number;
}

export function mintSession(address: `0x${string}`): {
  token: string;
  expiresAt: number;
} {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload: SessionPayload = { address: address.toLowerCase() as `0x${string}`, exp };
  const payloadJson = JSON.stringify(payload);
  const sig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadJson)
    .digest();
  const token = `${b64urlEncode(Buffer.from(payloadJson))}.${b64urlEncode(sig)}`;
  return { token, expiresAt: exp };
}

/**
 * Verify a token. Returns the SessionPayload on success, null on any failure
 * (malformed / bad signature / expired). Constant-time signature comparison
 * via crypto.timingSafeEqual so a length-leak doesn't differentiate
 * tampered-payload from tampered-signature in attacker timing.
 */
export function verifySession(token: string): SessionPayload | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payloadEncoded = token.slice(0, dot);
  const sigEncoded = token.slice(dot + 1);
  let payloadBuf: Buffer;
  let sigBuf: Buffer;
  try {
    payloadBuf = b64urlDecode(payloadEncoded);
    sigBuf = b64urlDecode(sigEncoded);
  } catch {
    return null;
  }
  const expectedSig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadBuf)
    .digest();
  if (sigBuf.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedSig)) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(payloadBuf.toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.address !== "string" || !payload.address.startsWith("0x")) {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
    return null;
  }
  return payload;
}

export const SESSION_COOKIE_NAME = "explore_session";
export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const padded = s
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}
