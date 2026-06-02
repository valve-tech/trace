import { describe, it, expect, beforeEach } from "vitest";
import {
  privateKeyToAccount,
  generatePrivateKey,
} from "viem/accounts";
import { createWalletClient, http, type WalletClient } from "viem";
import { mainnet } from "viem/chains";
import { DecryptionFailed } from "@valve-tech/wallet-crypto";
import {
  CURRENT_KEY_VERSION,
  EnvelopeFormatMismatch,
  _resetKeyCacheForTests,
  decryptStoreEnvelope,
  encryptStoreEnvelope,
  getWorkspaceKey,
} from "../lib/workspace/sync";
import type { WorkspaceStore } from "../lib/workspace/types";

/**
 * End-to-end tests for the workspace sync glue. Uses a viem WalletClient
 * backed by a generated private key — same code path as a real wallet,
 * just without a UI in the way. Signatures are deterministic (RFC 6979),
 * so deriveWalletEncryptionKey produces a stable key across runs of the
 * same test process.
 */

function makeTestSigner(): WalletClient {
  const account = privateKeyToAccount(generatePrivateKey());
  // The transport is required by createWalletClient but never used —
  // sign-message is a local operation against the in-memory account.
  return createWalletClient({ account, chain: mainnet, transport: http() });
}

const SAMPLE_STORE: WorkspaceStore = {
  schemaVersion: 1,
  workspaces: [
    {
      id: "ws1",
      name: "Lido incident 2026-05",
      description: "all addresses + tx hashes the bug touched",
      createdAt: 1_717_000_000_000,
      updatedAt: 1_717_200_000_000,
      items: [
        {
          id: "i1",
          kind: "address",
          value: "0xabc0000000000000000000000000000000000123",
          addedAt: 1_717_100_000_000,
        },
        {
          id: "i2",
          kind: "tx",
          value:
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          label: "the bug tx",
          addedAt: 1_717_150_000_000,
        },
      ],
    },
  ],
};

describe("workspace sync — crypto roundtrip", () => {
  beforeEach(() => _resetKeyCacheForTests());

  it("encrypts and decrypts a store back to the same value", async () => {
    const signer = makeTestSigner();
    const key = await getWorkspaceKey({ signer });

    const envelope = await encryptStoreEnvelope({ store: SAMPLE_STORE, key });
    const recovered = await decryptStoreEnvelope({ envelope, key });

    expect(recovered).toEqual(SAMPLE_STORE);
  });

  it("propagates the most recent updatedAt to the envelope", async () => {
    const signer = makeTestSigner();
    const key = await getWorkspaceKey({ signer });
    const envelope = await encryptStoreEnvelope({ store: SAMPLE_STORE, key });
    expect(envelope.updatedAt).toBe(1_717_200_000_000);
  });

  it("produces a different ciphertext on every encrypt (random IV)", async () => {
    const signer = makeTestSigner();
    const key = await getWorkspaceKey({ signer });
    const a = await encryptStoreEnvelope({ store: SAMPLE_STORE, key });
    const b = await encryptStoreEnvelope({ store: SAMPLE_STORE, key });
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    // Both still decrypt successfully to the same store.
    const recoveredA = await decryptStoreEnvelope({ envelope: a, key });
    const recoveredB = await decryptStoreEnvelope({ envelope: b, key });
    expect(recoveredA).toEqual(SAMPLE_STORE);
    expect(recoveredB).toEqual(SAMPLE_STORE);
  });
});

describe("workspace sync — key derivation discipline", () => {
  beforeEach(() => _resetKeyCacheForTests());

  it("derives the same key for the same wallet across multiple calls (cache hit)", async () => {
    const signer = makeTestSigner();
    const key1 = await getWorkspaceKey({ signer });
    const key2 = await getWorkspaceKey({ signer });
    // CryptoKey objects with `extractable: false` can't be compared byte-wise,
    // but they're cached as the same Promise, so reference equality is the
    // strongest assertion available. Equivalently: a roundtrip of one key
    // decrypts a ciphertext from the other.
    expect(key1).toBe(key2);
  });

  it("derives DIFFERENT keys for different wallets", async () => {
    const signerA = makeTestSigner();
    const signerB = makeTestSigner();
    const keyA = await getWorkspaceKey({ signer: signerA });
    const keyB = await getWorkspaceKey({ signer: signerB });
    expect(keyA).not.toBe(keyB);
    // Roundtrip check: a ciphertext encrypted under A must NOT decrypt under B.
    const envelope = await encryptStoreEnvelope({ store: SAMPLE_STORE, key: keyA });
    await expect(
      decryptStoreEnvelope({ envelope, key: keyB }),
    ).rejects.toBeInstanceOf(DecryptionFailed);
  });

  it("derives DIFFERENT keys for different versions of the same wallet", async () => {
    const signer = makeTestSigner();
    const keyV1 = await getWorkspaceKey({ signer, version: 1 });
    const keyV2 = await getWorkspaceKey({ signer, version: 2 });
    expect(keyV1).not.toBe(keyV2);
  });
});

describe("workspace sync — AAD discipline", () => {
  beforeEach(() => _resetKeyCacheForTests());

  it("rejects an envelope whose envelopeFormat was tampered to a different known value", async () => {
    const signer = makeTestSigner();
    const key = await getWorkspaceKey({ signer });
    const envelope = await encryptStoreEnvelope({ store: SAMPLE_STORE, key });
    // Forge a "v2" envelope — should fail the explicit format check before
    // even getting to AAD verification.
    const tampered = { ...envelope, envelopeFormat: 2 as unknown as 1 };
    await expect(
      decryptStoreEnvelope({ envelope: tampered, key }),
    ).rejects.toBeInstanceOf(EnvelopeFormatMismatch);
  });

  it("rejects an envelope whose keyVersion was tampered (AAD binding)", async () => {
    const signer = makeTestSigner();
    const key = await getWorkspaceKey({ signer });
    const envelope = await encryptStoreEnvelope({ store: SAMPLE_STORE, key });
    // Same envelopeFormat (passes the explicit check) but altered keyVersion
    // — AAD no longer matches, decrypt fails with DecryptionFailed.
    const tampered = { ...envelope, keyVersion: envelope.keyVersion + 1 };
    await expect(
      decryptStoreEnvelope({ envelope: tampered, key }),
    ).rejects.toBeInstanceOf(DecryptionFailed);
  });

  it("rejects an envelope whose ciphertext bytes were flipped", async () => {
    const signer = makeTestSigner();
    const key = await getWorkspaceKey({ signer });
    const envelope = await encryptStoreEnvelope({ store: SAMPLE_STORE, key });
    // Flip one character of the base64url'd ciphertext. The likelihood of
    // landing on a "structurally valid but logically different" plaintext
    // is negligible because AES-GCM's auth tag is what trips first.
    const flipped =
      envelope.ciphertext[0] === "A"
        ? "B" + envelope.ciphertext.slice(1)
        : "A" + envelope.ciphertext.slice(1);
    await expect(
      decryptStoreEnvelope({ envelope: { ...envelope, ciphertext: flipped }, key }),
    ).rejects.toBeInstanceOf(DecryptionFailed);
  });
});

describe("workspace sync — wire encoding", () => {
  beforeEach(() => _resetKeyCacheForTests());

  it("produces base64url (no '+' or '/' or '=')", async () => {
    const signer = makeTestSigner();
    const key = await getWorkspaceKey({ signer });
    // Use a larger store so the ciphertext has enough bytes to almost
    // certainly include characters that base64 would emit as '+' or '/'.
    const big: WorkspaceStore = {
      schemaVersion: 1,
      workspaces: Array.from({ length: 20 }, (_, i) => ({
        id: `ws${i}`,
        name: `workspace ${i} with some prose`,
        createdAt: i,
        updatedAt: i,
        items: [],
      })),
    };
    const envelope = await encryptStoreEnvelope({ store: big, key });
    expect(envelope.ciphertext).not.toMatch(/[+/=]/);
    expect(envelope.nonce).not.toMatch(/[+/=]/);
  });

  it("decrypts cleanly after base64url decode", async () => {
    const signer = makeTestSigner();
    const key = await getWorkspaceKey({ signer });
    const envelope = await encryptStoreEnvelope({ store: SAMPLE_STORE, key });
    // Roundtrip the JSON shape — proves the wire format survives a full
    // serialize/parse cycle (representative of what a real backend would do).
    const onTheWire = JSON.stringify(envelope);
    const parsed = JSON.parse(onTheWire) as typeof envelope;
    const recovered = await decryptStoreEnvelope({ envelope: parsed, key });
    expect(recovered).toEqual(SAMPLE_STORE);
  });
});

describe("workspace sync — key derivation export", () => {
  it("exposes CURRENT_KEY_VERSION as 1 (lock so a bump becomes a deliberate change)", () => {
    expect(CURRENT_KEY_VERSION).toBe(1);
  });
});
