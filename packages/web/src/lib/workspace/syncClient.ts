import { signAuthChallenge } from "@valve-tech/auth-lite";
import type { WalletClient } from "viem";
import type { WorkspaceSyncEnvelope } from "./sync.js";

/**
 * HTTP wrappers for the auth + workspace sync endpoints. Pure transport —
 * no React state, no caching. Higher layers (the useWorkspaceSync hook)
 * orchestrate retries, error handling, and the conflict-detection
 * timing-machine on top.
 *
 * All requests use `credentials: "include"` so the session cookie minted
 * by /api/auth/verify rides along on the workspace sync calls without
 * extra wiring.
 */

const APP_ID = "explore";

export interface AuthChallenge {
  nonce: string;
  expiresAt: number;
}

export async function fetchAuthChallenge(): Promise<AuthChallenge> {
  const res = await fetch(`/api/auth/nonce`, { credentials: "include" });
  const body = (await res.json()) as { ok: boolean; nonce?: string; expiresAt?: number; error?: string };
  if (!res.ok || !body.ok || !body.nonce || !body.expiresAt) {
    throw new SyncTransportError(`auth/nonce failed: ${body.error ?? res.status}`);
  }
  return { nonce: body.nonce, expiresAt: body.expiresAt };
}

export interface VerifyResult {
  address: `0x${string}`;
  expiresAt: number;
}

/**
 * Full SIWE-lite handshake: nonce → sign → verify. The session cookie is
 * set as a side effect of the verify response (httpOnly so the page
 * can't read it directly).
 */
export async function authenticate(
  signer: WalletClient,
): Promise<VerifyResult> {
  const { nonce } = await fetchAuthChallenge();
  const { address, signature } = await signAuthChallenge({
    signer,
    app: APP_ID,
    nonce,
  });
  const res = await fetch(`/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ address, signature, nonce }),
  });
  const body = (await res.json()) as {
    ok: boolean;
    address?: `0x${string}`;
    expiresAt?: number;
    error?: string;
  };
  if (!res.ok || !body.ok || !body.address || !body.expiresAt) {
    throw new SyncTransportError(`auth/verify failed: ${body.error ?? res.status}`);
  }
  return { address: body.address, expiresAt: body.expiresAt };
}

export async function logout(): Promise<void> {
  await fetch(`/api/auth/logout`, { method: "POST", credentials: "include" });
}

export interface PulledEnvelope extends WorkspaceSyncEnvelope {
  serverUpdatedAt: number;
}

/**
 * Pull the user's stored envelope. Returns null when the user has never
 * synced (HTTP 404 from the server). Throws on any other transport
 * failure including 401 (caller should re-authenticate before retrying).
 */
export async function pullSync(): Promise<PulledEnvelope | null> {
  const res = await fetch(`/api/workspaces/sync`, { credentials: "include" });
  if (res.status === 404) return null;
  if (res.status === 401) throw new SyncUnauthorized();
  const body = (await res.json()) as Partial<PulledEnvelope> & {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || !body.ok) {
    throw new SyncTransportError(`workspaces/sync GET failed: ${body.error ?? res.status}`);
  }
  // Strip the `ok` wrapper key so the returned shape matches the type.
  const { ok: _ok, error: _err, ...envelope } = body;
  return envelope as PulledEnvelope;
}

export async function pushSync(envelope: WorkspaceSyncEnvelope): Promise<{ serverUpdatedAt: number }> {
  const res = await fetch(`/api/workspaces/sync`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(envelope),
  });
  if (res.status === 401) throw new SyncUnauthorized();
  const body = (await res.json()) as { ok: boolean; serverUpdatedAt?: number; error?: string };
  if (!res.ok || !body.ok || !body.serverUpdatedAt) {
    throw new SyncTransportError(`workspaces/sync PUT failed: ${body.error ?? res.status}`);
  }
  return { serverUpdatedAt: body.serverUpdatedAt };
}

export class SyncUnauthorized extends Error {
  constructor() {
    super("Not signed in");
    this.name = "SyncUnauthorized";
  }
}

export class SyncTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncTransportError";
  }
}
