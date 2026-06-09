import {
  encryptEnvelope,
  decryptEnvelope,
  deriveWalletEncryptionKey,
} from "@valve-tech/wallet-crypto";
import type { WalletClient } from "viem";
import { EMPTY_STORE, type WorkspaceStore } from "./types.js";

/**
 * Encrypted-sync glue between the workspace store and
 * @valve-tech/wallet-crypto. This file owns the WIRE shape — what gets
 * uploaded to / downloaded from the backend — and the crypto roundtrip.
 *
 * The wallet connection, the backend endpoints, and the conflict-resolution
 * UI are deliberately NOT here. Each gets its own commit. This module is the
 * smallest correct piece: prove the crypto roundtrip works end-to-end, with
 * a stable wire format, so the integration around it has somewhere to plug
 * into.
 */

/**
 * The exact bytes-on-the-wire structure. Every field has a single concern:
 *
 *   envelopeFormat — version of THIS wire format. Bump when the JSON shape
 *                    of WorkspaceStore changes incompatibly OR when the
 *                    cipher / AAD changes. Carried in AAD so a downgrade
 *                    attack can't swap a v2 envelope for a v1 one.
 *   keyVersion     — version passed to deriveWalletEncryptionKey. Bumping
 *                    invalidates every prior blob for that wallet. Carried
 *                    in AAD for the same reason.
 *   ciphertext     — AES-GCM output, base64url.
 *   nonce          — 12-byte AES-GCM IV (NOT the auth nonce — see the
 *                    wallet-crypto README, this is the most common
 *                    cross-package naming collision).
 *   updatedAt      — ms epoch from the encrypter's clock. Used by the
 *                    eventual conflict-resolution layer to decide push/pull
 *                    direction; not part of the auth tag because that layer
 *                    needs to see it to make a decision.
 */
export interface WorkspaceSyncEnvelope {
  envelopeFormat: 1;
  keyVersion: number;
  ciphertext: string;
  nonce: string;
  updatedAt: number;
}

export const WORKSPACE_KEY_PURPOSE = "explore-workspaces";

/**
 * The current key version. Bumping triggers a wallet re-signing prompt on
 * next sync and invalidates every previously-uploaded blob. Do not bump
 * without a migration plan.
 */
export const CURRENT_KEY_VERSION = 1;

/** Same for the wire format. */
export const CURRENT_ENVELOPE_FORMAT = 1 as const;

/**
 * Derive (and cache) the encryption key for this wallet. The cache is a
 * Promise so callers racing for the key share one wallet prompt instead of
 * popping N modals. Cached against (address, version) — switching wallets
 * or bumping version produces a fresh derivation.
 */
const keyCache = new Map<string, Promise<CryptoKey>>();

export function getWorkspaceKey(opts: {
  signer: WalletClient;
  version?: number;
}): Promise<CryptoKey> {
  const version = opts.version ?? CURRENT_KEY_VERSION;
  const address = opts.signer.account?.address;
  if (!address) {
    return Promise.reject(
      new Error("WorkspaceSync: signer has no connected account"),
    );
  }
  const cacheKey = `${address.toLowerCase()}::${version}`;
  let pending = keyCache.get(cacheKey);
  if (!pending) {
    pending = deriveWalletEncryptionKey({
      signer: opts.signer,
      purpose: WORKSPACE_KEY_PURPOSE,
      version,
    });
    keyCache.set(cacheKey, pending);
    // If the derivation throws (user rejected, etc.) we MUST drop the
    // cached rejected promise — otherwise every subsequent call returns the
    // same rejection without re-prompting.
    pending.catch(() => keyCache.delete(cacheKey));
  }
  return pending;
}

/** Test-only: clear the cache between assertions. */
export function _resetKeyCacheForTests(): void {
  keyCache.clear();
}

/**
 * Serialize a workspace store + encrypt it for upload. The envelope's
 * envelopeFormat and keyVersion are bound to the ciphertext via AAD — a
 * downgrade attack that swaps these fields in transit will fail decryption.
 */
export async function encryptStoreEnvelope(opts: {
  store: WorkspaceStore;
  key: CryptoKey;
  keyVersion?: number;
}): Promise<WorkspaceSyncEnvelope> {
  const keyVersion = opts.keyVersion ?? CURRENT_KEY_VERSION;
  const updatedAt = mostRecentUpdate(opts.store);

  const plaintext = new TextEncoder().encode(JSON.stringify(opts.store));
  const aad = new TextEncoder().encode(
    `${CURRENT_ENVELOPE_FORMAT}|${keyVersion}`,
  );

  const { ciphertext, nonce } = await encryptEnvelope({
    key: opts.key,
    plaintext,
    aad,
  });

  return {
    envelopeFormat: CURRENT_ENVELOPE_FORMAT,
    keyVersion,
    ciphertext: bytesToBase64Url(ciphertext),
    nonce: bytesToBase64Url(nonce),
    updatedAt,
  };
}

/**
 * Decrypt + parse an envelope back into a WorkspaceStore. Throws
 * `DecryptionFailed` (from @valve-tech/wallet-crypto) on any of: wrong key,
 * tampered ciphertext, mismatched AAD, IV/nonce mismatch.
 *
 * `EnvelopeFormatMismatch` is thrown if the envelope's `envelopeFormat`
 * isn't one we know how to read — a future v2 client reading a v1 blob
 * needs an explicit migration path, not a silent best-effort parse.
 */
export async function decryptStoreEnvelope(opts: {
  envelope: WorkspaceSyncEnvelope;
  key: CryptoKey;
}): Promise<WorkspaceStore> {
  if (opts.envelope.envelopeFormat !== CURRENT_ENVELOPE_FORMAT) {
    throw new EnvelopeFormatMismatch(
      `Envelope format v${opts.envelope.envelopeFormat} not readable by this client (expected v${CURRENT_ENVELOPE_FORMAT})`,
    );
  }
  const ciphertext = base64UrlToBytes(opts.envelope.ciphertext);
  const nonce = base64UrlToBytes(opts.envelope.nonce);
  const aad = new TextEncoder().encode(
    `${opts.envelope.envelopeFormat}|${opts.envelope.keyVersion}`,
  );
  const plaintextBytes = await decryptEnvelope({
    key: opts.key,
    ciphertext,
    nonce,
    aad,
  });
  const parsed = JSON.parse(new TextDecoder().decode(plaintextBytes)) as unknown;
  if (!isWorkspaceStore(parsed)) {
    // Ciphertext decrypted but the JSON inside doesn't have the expected
    // shape — could happen if a different app encrypted under the same key
    // version (impossible in practice; purpose strings differ) or if the
    // store schema changed underneath us. Surface as the "downloaded
    // something but couldn't use it" outcome instead of silently corrupting
    // local state.
    return EMPTY_STORE;
  }
  return parsed;
}

export class EnvelopeFormatMismatch extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeFormatMismatch";
  }
}

/**
 * Return the most recent updatedAt across all workspaces in the store, or
 * 0 if empty. Used as the envelope's `updatedAt` because the WorkspaceStore
 * itself doesn't carry a top-level timestamp — the "last interesting
 * change" is whichever workspace got mutated most recently.
 */
function mostRecentUpdate(store: WorkspaceStore): number {
  let max = 0;
  for (const ws of store.workspaces) {
    if (ws.updatedAt > max) max = ws.updatedAt;
  }
  return max;
}

// -----------------------------------------------------------------------------
// Wire encoding — base64url for ciphertext + nonce. We DON'T use base64
// because URL-safe encoding lets the envelope be passed through query
// strings, headers, and JSON without escaping mishaps. Round-trip lossless
// for any byte sequence.
// -----------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str: string): Uint8Array {
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

// -----------------------------------------------------------------------------
// Shape guard for downloaded plaintext.
// -----------------------------------------------------------------------------

function isWorkspaceStore(v: unknown): v is WorkspaceStore {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<WorkspaceStore>;
  return s.schemaVersion === 1 && Array.isArray(s.workspaces);
}
