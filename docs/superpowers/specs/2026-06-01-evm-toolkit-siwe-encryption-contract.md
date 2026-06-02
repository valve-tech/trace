# Consumer Contract: `@valve-tech/evm-toolkit` — SIWE-lite Auth + Wallet-Derived Encryption

## Status

**Satisfied** by `@valve-tech/auth-lite@0.18.0` + `@valve-tech/wallet-crypto@0.18.0`
(published 2026-06-02). The published packages match this contract on every
function shape, error class, and security invariant. Two refinements beyond
the contract:

* Split into **two packages** (`auth-lite` + `wallet-crypto`) instead of one
  with sub-folders, so products that only need auth don't bundle the crypto
  code. Strictly better than what was proposed here.
* `signAuthChallenge` adds a **structural base64url + min-length nonce
  check** before invoking the wallet, catching a server bug returning `""`
  before the user is asked to sign nothing.
* Both packages reuse `@valve-tech/viem-errors` for `isUserRejectionError`
  instead of one-off rejection detection. Cleaner — the rejection-signal
  vocabulary lives in one place across the toolkit.

This doc is preserved as the requirements trail that drove the package
design. New consumer-side work should reference the published API directly,
not this doc.

## Purpose

Explore needs two cryptographic primitives that aren't worth building in-app:

1. **Wallet-derived encryption keys** — deterministic, versioned, so the same
   wallet derives the same AES-GCM key on any device for our cloud-sync of
   encrypted workspace blobs.
2. **SIWE-lite authentication** — server-issued nonce challenge, client signs,
   server recovers the address and issues a session. Simpler than full
   EIP-4361 because we're single-app: we don't need domain binding for
   cross-app session portability.

Both belong in `@valve-tech/evm-toolkit` because every Valve product that
adds a "wallet-gated user" feature will need them. Pull them out once, never
write them again.

This doc is the **consumer contract** — the API shape Explore wants to
import. The toolkit maintainer owns the implementation; we own this contract.
Breaking changes need a major-version bump (Explore pins the version).

---

## Why not EIP-4361 (full SIWE)?

EIP-4361's structured-message format defends against cross-site signature
replay (a malicious site asks you to sign the same shape, replays on the
real site). The fields it adds — Domain, URI, Chain ID, Statement, Issued
At, optional Expiration, Resources — exist for that threat model.

We are single-app. Our threat model is narrower:

* No third-party app should be able to replay our auth → covered by a
  server-issued, per-session, single-use **nonce**.
* No third-party app should be able to learn our encryption key → covered
  by a fixed **deterministic** message that's specific to Explore (and to
  the schema version we control).

Reducing to "just enough" cryptographic structure makes the spec smaller,
faster to audit, and removes EIP-4361's optionality (multiple `Resources`
URIs, `Not Before`, request IDs). We can adopt full SIWE later for label-
attestation use cases where its session-token portability matters; the two
schemes can coexist because their signed-message templates don't collide.

---

## Module layout

```
@valve-tech/evm-toolkit
├── auth/
│   ├── nonce.ts        ← server-side: generateAuthNonce, verifyAuthSignature
│   ├── challenge.ts    ← client-side: signAuthChallenge
│   └── message.ts      ← shared: AUTH_MESSAGE_TEMPLATE, formatAuthMessage
└── crypto/
    ├── deriveKey.ts    ← client-side: deriveWalletEncryptionKey
    └── envelope.ts     ← shared: encryptEnvelope, decryptEnvelope
```

ESM only. TypeScript sources use `.js` extensions in imports (matching the
repo-wide ESM resolution convention). `viem` is a peer dependency, not a
bundled dep — Explore already has viem, the toolkit should not duplicate.

---

## Client-side API (called from `packages/web`)

### `deriveWalletEncryptionKey`

```ts
import type { WalletClient } from "viem";

/**
 * Derive a deterministic 256-bit encryption key from a wallet signature.
 * Signs a FIXED, versioned message — same wallet + same version → same key,
 * forever, across devices. Use the returned key with WebCrypto AES-GCM or
 * ChaCha20-Poly1305.
 *
 * Throws WalletDeclined if the user rejects the signature prompt.
 * Throws WalletUnavailable if the WalletClient has no account connected.
 *
 * Implementation: signs `formatKeyDerivationMessage({ purpose, version })`
 * via personal_sign (NOT eth_sign), then SHA-256s the signature bytes to
 * produce the key material, then importKey()s as a non-extractable
 * CryptoKey. The signature itself never leaves this function.
 */
export async function deriveWalletEncryptionKey(opts: {
  signer: WalletClient;
  /** App-specific purpose string. Explore uses "explore-workspaces". */
  purpose: string;
  /** Schema version — bump to rotate the key without touching purpose. */
  version: number;
  /** WebCrypto usage tags. Default: ["encrypt", "decrypt"]. */
  usages?: KeyUsage[];
}): Promise<CryptoKey>;
```

**Key invariants the implementation MUST hold:**

1. The signed message MUST include both `purpose` and `version` in a fixed
   plaintext format so signatures are not portable across purposes or
   versions.
2. The returned `CryptoKey` MUST be created with `extractable: false`
   (so a leak in app code can't exfiltrate the raw key material).
3. The signature bytes MUST be discarded after the SHA-256 — don't store,
   don't log, don't return.

### `signAuthChallenge`

```ts
import type { WalletClient } from "viem";
import type { Address, Hex } from "viem";

/**
 * Sign a server-issued auth nonce. Returns the signature + the address that
 * signed (so the caller can echo both to the verify endpoint without an
 * extra getAddresses() call).
 *
 * Throws WalletDeclined / WalletUnavailable like deriveWalletEncryptionKey.
 * Throws InvalidNonce if `nonce` isn't a base64url string of >= 16 bytes
 * (basic sanity check — protects against accidental empty-string signing).
 */
export async function signAuthChallenge(opts: {
  signer: WalletClient;
  /** App identifier — appears in the human-readable signed message. */
  app: string;
  /** Server-issued nonce. Opaque to this function. */
  nonce: string;
}): Promise<{ address: Address; signature: Hex; message: string }>;
```

### `encryptEnvelope` / `decryptEnvelope`

```ts
/**
 * AES-GCM envelope with a 12-byte random nonce. The nonce is returned
 * separately (not baked into the ciphertext) so the caller can store it
 * in a structured field, not concatenated bytes.
 *
 * Algorithm choice: AES-GCM with WebCrypto. Universal browser support,
 * AEAD, constant-time in modern implementations. ChaCha20-Poly1305 was
 * considered but WebCrypto.subtle doesn't expose it in all browsers.
 */
export async function encryptEnvelope(opts: {
  key: CryptoKey;
  plaintext: Uint8Array;
  /** Optional associated data — bound to ciphertext, not encrypted. Use for
   *  protocol metadata (e.g. envelope version) so a downgrade attack can't
   *  swap a v2 ciphertext for a v1 one. */
  aad?: Uint8Array;
}): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }>;

export async function decryptEnvelope(opts: {
  key: CryptoKey;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  aad?: Uint8Array;
}): Promise<Uint8Array>;
```

**Important:** the nonce here is the AES-GCM IV, NOT the auth nonce from
`signAuthChallenge`. Different concept, same word. The toolkit's docstrings
must call this out — confusion between the two is the most likely caller
error.

---

## Server-side API (called from `packages/api`)

### `generateAuthNonce`

```ts
/**
 * Generate a fresh auth nonce + expiry. The caller is responsible for
 * storing the nonce in a "issued-but-unused" set (Postgres row, Redis key,
 * whatever) and rejecting verifySignature calls whose nonce isn't in that
 * set (or has already been used). The toolkit doesn't own that storage.
 *
 * Returns base64url-encoded 32 random bytes by default.
 */
export function generateAuthNonce(opts?: {
  /** Default: 32. Minimum: 16. Maximum: 64. */
  bytes?: number;
  /** Default: 5 minutes. Minimum: 30 seconds. Maximum: 1 hour. */
  ttlSeconds?: number;
}): { nonce: string; expiresAt: number };
```

### `verifyAuthSignature`

```ts
import type { Address, Hex } from "viem";

/**
 * Verify a signed auth challenge. Returns the recovered address if the
 * signature is valid AND the message matches the expected format for the
 * given app+nonce; null otherwise. Constant-time on the failure path
 * (don't leak whether the failure was bad-signature vs. bad-message).
 *
 * Caller MUST also check that the nonce hasn't been used before — that
 * check belongs in the caller's storage layer, not here.
 */
export async function verifyAuthSignature(opts: {
  app: string;
  nonce: string;
  signature: Hex;
  /** The address the client claims signed it. Verification recovers the
   *  signer; this is provided as a fast-fail check before the expensive
   *  recover. */
  claimedAddress: Address;
}): Promise<Address | null>;
```

---

## Shared message templates

Both sides MUST format the signed message identically. Expose the templates
as named functions so server-side validation can use the same source of
truth:

```ts
/** Returns the exact plaintext the client will sign for key derivation. */
export function formatKeyDerivationMessage(opts: {
  purpose: string;
  version: number;
}): string;
// Returns e.g.:
//   "Explore key derivation
//    Purpose: explore-workspaces
//    Version: 1
//    This signature derives an encryption key. It does NOT authorize any
//    transaction or transfer."

/** Returns the exact plaintext the client will sign for auth. */
export function formatAuthMessage(opts: {
  app: string;
  nonce: string;
}): string;
// Returns e.g.:
//   "Sign in to Explore
//    Nonce: AbC123
//    This signature authenticates your session. It does NOT authorize any
//    transaction or transfer."
```

The "does NOT authorize" line is non-negotiable. Wallets display the raw
text on signing; users must see this assurance before clicking confirm.

---

## Error semantics

The toolkit MUST expose typed error classes (not bare `throw new Error()`):

```ts
export class WalletDeclined extends Error {}          // user rejected
export class WalletUnavailable extends Error {}       // no account / locked
export class InvalidNonce extends Error {}            // sanity-fail
export class SignatureMismatch extends Error {}       // recover succeeded but != claimed
export class DecryptionFailed extends Error {}        // wrong key / tampered ciphertext
```

Explore catches these and renders product-appropriate UI (e.g.
`WalletDeclined` → "Sign in canceled" toast; `DecryptionFailed` → "Your
encrypted backup couldn't be opened — wallet mismatch?" prompt). Generic
`Error` throws are not OK because they force string-matching on `.message`.

---

## Testing obligations

The toolkit MUST ship tests that verify:

1. **Determinism.** `deriveWalletEncryptionKey` called twice with the same
   wallet + purpose + version produces the same key material (hash the
   raw bytes pre-importKey for the assertion).
2. **Cross-purpose isolation.** Different `purpose` strings produce
   different keys.
3. **Cross-version isolation.** Different `version` values produce
   different keys.
4. **Roundtrip.** `decryptEnvelope(encryptEnvelope(x))` === x for various
   sizes (1 byte, 1KB, 1MB).
5. **AAD binding.** Decryption with a different `aad` fails (proves AEAD
   is wired correctly).
6. **Nonce uniqueness.** 10,000 `generateAuthNonce` calls produce 10,000
   distinct nonces (basic RNG sanity).
7. **Signature verification.** A known-good signature verifies; a flipped
   bit fails.
8. **Cross-app rejection.** A signature for `app: "explore"` doesn't
   verify against `app: "other"`.

100% line + branch coverage on the crypto modules. The toolkit's SDK
convention (see `@valve-tech/trace-sdk`) already enforces this via
vitest's `--coverage` threshold — keep that.

---

## Versioning + key rotation

Each consumer pins a specific `version` for `deriveWalletEncryptionKey`.
Bumping version is a deliberate decision — it invalidates every existing
encrypted blob (they were encrypted with the old key). Migration flow:

1. App reads its old blob, decrypts with v1 key.
2. App derives v2 key.
3. App re-encrypts with v2, writes back.
4. App updates its persisted "current version" flag.

The toolkit doesn't own this migration; it owns deriving distinct keys per
version. The migration is per-product.

---

## Non-goals

* **Wallet adapters.** This package assumes the caller already has a viem
  `WalletClient`. Wallet-connection UX (MetaMask vs WalletConnect vs
  injected) is a separate concern.
* **Session token issuance.** `verifyAuthSignature` returns the recovered
  address; the caller mints whatever session token (JWT, opaque DB row,
  signed cookie) fits its needs.
* **Nonce storage.** The toolkit's nonce generation is stateless; whoever
  calls `generateAuthNonce` owns persisting + invalidating the nonce.
* **Persistent encrypted storage.** Encryption envelopes are bytes;
  storing them (IDB, S3, IPFS, postgres) is the caller's job.
* **Full EIP-4361 compatibility.** Use-cases that need cross-app session
  portability (e.g. attested labels per the 2026-05-29 spec) should add a
  separate `siwe/` module later that complies with the full EIP. Don't
  retrofit this minimal scheme into one.

---

## What Explore will do with it (caller-side preview)

For context — this is what Explore's `packages/web` import will look like
once the package is published:

```ts
import {
  deriveWalletEncryptionKey,
  encryptEnvelope,
  decryptEnvelope,
  signAuthChallenge,
} from "@valve-tech/evm-toolkit";

// One-time per session, after wallet connect:
const key = await deriveWalletEncryptionKey({
  signer: walletClient,
  purpose: "explore-workspaces",
  version: 1,
});

// On every push to the backend:
const blob = JSON.stringify(workspaces);
const { ciphertext, nonce } = await encryptEnvelope({
  key,
  plaintext: new TextEncoder().encode(blob),
  aad: new TextEncoder().encode("envelope-v1"),
});
await fetch("/api/workspaces/sync", {
  method: "PUT",
  headers: { Authorization: `Bearer ${sessionToken}` },
  body: JSON.stringify({
    ciphertext: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
    envelope: "v1",
  }),
});

// Session bootstrap:
const { nonce: serverNonce } = await fetch("/api/auth/nonce").then(r => r.json());
const { address, signature } = await signAuthChallenge({
  signer: walletClient,
  app: "explore",
  nonce: serverNonce,
});
const { sessionToken } = await fetch("/api/auth/verify", {
  method: "POST",
  body: JSON.stringify({ address, signature, nonce: serverNonce }),
}).then(r => r.json());
```

The whole flow is ~15 lines of caller code. If the API gets significantly
more verbose than this, something in the contract is wrong.
