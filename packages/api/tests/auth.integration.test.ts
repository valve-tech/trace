import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { formatAuthMessage } from "@valve-tech/auth-lite";

/**
 * Integration tests for /api/auth/*. Requires:
 *   - API server on http://localhost:10100
 *   - Postgres reachable (migrations 001..008 applied at startup)
 *
 * The signing path uses viem/accounts so we sign locally with a generated
 * private key — same code path as a real wallet, no UI in the loop.
 */

const BASE = "http://localhost:10100";

async function getNonce(): Promise<{ nonce: string; expiresAt: number }> {
  const res = await fetch(`${BASE}/api/auth/nonce`);
  assert.equal(res.status, 200, `expected 200, got ${res.status}`);
  const body = (await res.json()) as { ok: boolean; nonce: string; expiresAt: number };
  assert.equal(body.ok, true);
  return { nonce: body.nonce, expiresAt: body.expiresAt };
}

async function postVerify(input: {
  address: string;
  signature: string;
  nonce: string;
}): Promise<{ status: number; body: unknown; setCookie: string | null }> {
  const res = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return {
    status: res.status,
    body: await res.json(),
    setCookie: res.headers.get("set-cookie"),
  };
}

async function isApiHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function skipUnlessHealthy(t: { skip: (reason: string) => void }): Promise<boolean> {
  const ok = await isApiHealthy();
  if (!ok) {
    t.skip(`API not reachable at ${BASE} — run 'npm run dev:api' to enable these tests`);
  }
  return ok;
}

describe("/api/auth/nonce", () => {
  it("issues a fresh base64url nonce + expiresAt", async (t) => {
    if (!(await skipUnlessHealthy(t))) return;
    const { nonce, expiresAt } = await getNonce();
    assert.match(nonce, /^[A-Za-z0-9_-]+$/, "nonce should be base64url");
    assert.ok(nonce.length >= 22, "nonce should decode to >=16 bytes");
    assert.ok(expiresAt > Date.now(), "expiresAt should be in the future");
    assert.ok(expiresAt - Date.now() <= 6 * 60_000, "expiresAt should be ~5 min out");
  });

  it("issues distinct nonces on consecutive calls", async (t) => {
    if (!(await skipUnlessHealthy(t))) return;
    const a = await getNonce();
    const b = await getNonce();
    assert.notEqual(a.nonce, b.nonce);
  });
});

describe("/api/auth/verify", () => {
  it("accepts a valid signature, mints a session cookie, returns the address", async (t) => {
    if (!(await skipUnlessHealthy(t))) return;
    const account = privateKeyToAccount(generatePrivateKey());
    const { nonce } = await getNonce();
    const message = formatAuthMessage({ app: "explore", nonce });
    const signature = await account.signMessage({ message });

    const { status, body, setCookie } = await postVerify({
      address: account.address,
      signature,
      nonce,
    });
    assert.equal(status, 200);
    const ok = body as { ok: boolean; address: string };
    assert.equal(ok.ok, true);
    assert.equal(ok.address, account.address.toLowerCase());
    assert.ok(setCookie?.includes("explore_session="), "session cookie was not set");
  });

  it("rejects a replayed nonce on the second verify (401)", async (t) => {
    if (!(await skipUnlessHealthy(t))) return;
    const account = privateKeyToAccount(generatePrivateKey());
    const { nonce } = await getNonce();
    const message = formatAuthMessage({ app: "explore", nonce });
    const signature = await account.signMessage({ message });

    const first = await postVerify({
      address: account.address,
      signature,
      nonce,
    });
    assert.equal(first.status, 200);

    const replay = await postVerify({
      address: account.address,
      signature,
      nonce,
    });
    assert.equal(replay.status, 401, "second verify on same nonce should fail");
  });

  it("rejects a signature signed under a different app id (401)", async (t) => {
    if (!(await skipUnlessHealthy(t))) return;
    const account = privateKeyToAccount(generatePrivateKey());
    const { nonce } = await getNonce();
    // Sign for "other" instead of "explore" — verifyAuthSignature reconstructs
    // the message with the server's APP_ID and fails the recover.
    const otherAppMessage = formatAuthMessage({ app: "other", nonce });
    const signature = await account.signMessage({ message: otherAppMessage });

    const { status } = await postVerify({
      address: account.address,
      signature,
      nonce,
    });
    assert.equal(status, 401);
  });

  it("rejects an unknown nonce (401)", async (t) => {
    if (!(await skipUnlessHealthy(t))) return;
    const account = privateKeyToAccount(generatePrivateKey());
    const bogusNonce = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";
    const message = formatAuthMessage({ app: "explore", nonce: bogusNonce });
    const signature = await account.signMessage({ message });
    const { status } = await postVerify({
      address: account.address,
      signature,
      nonce: bogusNonce,
    });
    assert.equal(status, 401);
  });

  it("rejects malformed body with 400", async (t) => {
    if (!(await skipUnlessHealthy(t))) return;
    const res = await fetch(`${BASE}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "not-an-address", signature: "nope", nonce: "" }),
    });
    assert.equal(res.status, 400);
  });
});

describe("/api/auth/logout", () => {
  it("clears the session cookie", async (t) => {
    if (!(await skipUnlessHealthy(t))) return;
    const res = await fetch(`${BASE}/api/auth/logout`, { method: "POST" });
    assert.equal(res.status, 200);
    const setCookie = res.headers.get("set-cookie");
    // The clear directive shows up as `explore_session=; ... Expires=Thu, 01 Jan 1970 ...`
    assert.ok(
      setCookie?.includes("explore_session=") && /expires=/i.test(setCookie),
      "logout should send an expired session cookie",
    );
  });
});
