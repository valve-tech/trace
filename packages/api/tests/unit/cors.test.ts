import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import type { CorsOptions } from "cors";

/**
 * Unit tests for the split cross-origin policy. The allowlist is read from
 * `CREDENTIALED_ORIGINS` at module load, so we set it BEFORE importing the
 * module under test (a dynamic import after the env assignment).
 */

const GATEWAY = "https://gw.example";
const APP = "https://explore.acme.io";
const STRANGER = "https://evil.example";

process.env.CREDENTIALED_ORIGINS = `${GATEWAY}, ${APP}`;
const { isCredentialedOrigin, corsDelegate, sessionCookieSecurity } = await import(
  "../../src/lib/cors.js"
);

/** Run the cors delegate and return the options it resolves. */
function resolveCors(origin: string | undefined): CorsOptions {
  let captured: CorsOptions = {};
  corsDelegate(
    { headers: { origin } } as never,
    (_err: Error | null, opts?: CorsOptions) => {
      captured = opts ?? {};
    },
  );
  return captured;
}

const reqFrom = (origin: string | undefined): Request =>
  ({ headers: { origin } }) as unknown as Request;

describe("cors — isCredentialedOrigin", () => {
  it("accepts allowlisted origins (trimmed)", () => {
    assert.equal(isCredentialedOrigin(GATEWAY), true);
    assert.equal(isCredentialedOrigin(APP), true);
  });
  it("rejects unknown origins and undefined", () => {
    assert.equal(isCredentialedOrigin(STRANGER), false);
    assert.equal(isCredentialedOrigin(undefined), false);
  });
  it("is exact-match (no substring/suffix sneak-through)", () => {
    assert.equal(isCredentialedOrigin("https://gw.example.evil.com"), false);
    assert.equal(isCredentialedOrigin("http://gw.example"), false); // scheme differs
  });
});

describe("cors — corsDelegate", () => {
  it("reflects + credentials for an allowlisted origin", () => {
    const opts = resolveCors(GATEWAY);
    assert.equal(opts.origin, true);
    assert.equal(opts.credentials, true);
  });
  it("open read-only (no credentials) for a stranger origin", () => {
    const opts = resolveCors(STRANGER);
    assert.equal(opts.origin, "*");
    assert.equal(opts.credentials, false);
  });
  it("open read-only for a request with no Origin (same-origin / curl)", () => {
    const opts = resolveCors(undefined);
    assert.equal(opts.origin, "*");
    assert.equal(opts.credentials, false);
  });
});

describe("cors — sessionCookieSecurity", () => {
  it("None+Secure for an allowlisted cross-origin request", () => {
    assert.deepEqual(sessionCookieSecurity(reqFrom(GATEWAY)), {
      sameSite: "none",
      secure: true,
    });
  });
  it("Lax for a same-origin / non-allowlisted request", () => {
    // NODE_ENV is not "production" under the test runner → secure false.
    assert.deepEqual(sessionCookieSecurity(reqFrom(undefined)), {
      sameSite: "lax",
      secure: false,
    });
    assert.deepEqual(sessionCookieSecurity(reqFrom(STRANGER)), {
      sameSite: "lax",
      secure: false,
    });
  });
});
