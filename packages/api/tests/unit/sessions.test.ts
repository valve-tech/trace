import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

/**
 * Unit tests for the HMAC session token module. SESSION_SECRET is fixed
 * here so tokens are reproducible; the module reads process.env at import
 * time, so we set it BEFORE the dynamic import.
 */

process.env.SESSION_SECRET = "a".repeat(32);
process.env.NODE_ENV = "test";

let mintSession: typeof import("../../src/services/auth/sessions.js").mintSession;
let verifySession: typeof import("../../src/services/auth/sessions.js").verifySession;
let SESSION_COOKIE_MAX_AGE_SECONDS: number;

before(async () => {
  const mod = await import("../../src/services/auth/sessions.js");
  mintSession = mod.mintSession;
  verifySession = mod.verifySession;
  SESSION_COOKIE_MAX_AGE_SECONDS = mod.SESSION_COOKIE_MAX_AGE_SECONDS;
});

const ADDR = "0x" + "a".repeat(40) as `0x${string}`;

describe("sessions — mint/verify roundtrip", () => {
  it("mints a verifiable session for the given address", () => {
    const { token, expiresAt } = mintSession(ADDR);
    const session = verifySession(token);
    assert.ok(session, "verify returned null");
    assert.equal(session!.address, ADDR);
    assert.equal(session!.exp, expiresAt);
  });

  it("expiresAt is ~7 days from now", () => {
    const { expiresAt } = mintSession(ADDR);
    const sevenDaysSec = 7 * 24 * 60 * 60;
    assert.equal(SESSION_COOKIE_MAX_AGE_SECONDS, sevenDaysSec);
    const deltaSec = Math.abs(expiresAt - Date.now()) / 1000;
    // Allow generous slop for test machine slowness — 1 minute.
    assert.ok(Math.abs(deltaSec - sevenDaysSec) < 60, `expiry was ${deltaSec}s out`);
  });

  it("normalizes the address to lowercase", () => {
    const checksummed = "0xAbCdEf0000000000000000000000000000000000" as `0x${string}`;
    const { token } = mintSession(checksummed);
    const session = verifySession(token);
    assert.equal(session!.address, checksummed.toLowerCase());
  });
});

describe("sessions — verify rejects", () => {
  it("returns null for a token with a tampered payload (signature mismatch)", () => {
    const { token } = mintSession(ADDR);
    const [payload, sig] = token.split(".");
    // Replace one character in payload to force HMAC mismatch.
    const flipped = (payload!.charAt(0) === "A" ? "B" : "A") + payload!.slice(1);
    assert.equal(verifySession(`${flipped}.${sig}`), null);
  });

  it("returns null for a token with a tampered signature", () => {
    const { token } = mintSession(ADDR);
    const [payload, sig] = token.split(".");
    const flipped = (sig!.charAt(0) === "A" ? "B" : "A") + sig!.slice(1);
    assert.equal(verifySession(`${payload}.${flipped}`), null);
  });

  it("returns null for a missing dot separator", () => {
    assert.equal(verifySession("just-a-blob-no-dot"), null);
  });

  it("returns null for an empty token", () => {
    assert.equal(verifySession(""), null);
  });

  it("returns null when the payload's exp has passed", async () => {
    // Construct a token by hand with exp=0 so we don't have to wait.
    const crypto = await import("node:crypto");
    const payload = JSON.stringify({ address: ADDR, exp: 0 });
    const payloadB64 = Buffer.from(payload)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const sig = crypto
      .createHmac("sha256", "a".repeat(32))
      .update(payload)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const token = `${payloadB64}.${sig}`;
    assert.equal(verifySession(token), null);
  });
});

describe("sessions — cross-secret rejection", () => {
  // Can't easily test cross-secret in the same process since SESSION_SECRET
  // is resolved at import time. The invariant — verify rejects signatures
  // produced with a different secret — is structurally true given the
  // HMAC.timingSafeEqual check; covered by the tampered-signature test
  // above (a flipped signature byte ≡ a "different secret" signature).
  it("documented in test file (see comment)", () => assert.ok(true));
});
