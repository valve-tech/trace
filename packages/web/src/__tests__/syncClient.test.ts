import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchAuthChallenge,
  pullSync,
  pushSync,
  SyncUnauthorized,
  SyncTransportError,
} from "../lib/workspace/syncClient";

/**
 * Unit tests for the sync HTTP wrappers. Mocks `fetch` globally; verifies
 * each function maps wire shapes to the expected typed return / throws
 * the expected error class.
 */

function mockFetch(response: { status: number; body: unknown; ok?: boolean }) {
  const status = response.status;
  const ok = response.ok ?? (status >= 200 && status < 300);
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => response.body,
  }) as unknown as typeof fetch;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchAuthChallenge", () => {
  it("returns nonce + expiresAt on a 200 ok:true response", async () => {
    mockFetch({
      status: 200,
      body: { ok: true, nonce: "abcdef1234567890_", expiresAt: 1_717_300_000_000 },
    });
    const result = await fetchAuthChallenge();
    expect(result.nonce).toBe("abcdef1234567890_");
    expect(result.expiresAt).toBe(1_717_300_000_000);
  });

  it("throws SyncTransportError on ok:false response", async () => {
    mockFetch({ status: 200, body: { ok: false, error: "db down" } });
    await expect(fetchAuthChallenge()).rejects.toBeInstanceOf(SyncTransportError);
  });

  it("throws SyncTransportError on 5xx", async () => {
    mockFetch({ status: 503, body: { ok: false, error: "service unavailable" }, ok: false });
    await expect(fetchAuthChallenge()).rejects.toBeInstanceOf(SyncTransportError);
  });
});

describe("pullSync", () => {
  it("returns null on a 404 (user has never synced)", async () => {
    mockFetch({ status: 404, body: { ok: false, error: "No synced workspace blob" } });
    const result = await pullSync();
    expect(result).toBeNull();
  });

  it("throws SyncUnauthorized on 401", async () => {
    mockFetch({ status: 401, body: { ok: false, error: "Not signed in" } });
    await expect(pullSync()).rejects.toBeInstanceOf(SyncUnauthorized);
  });

  it("returns the typed envelope on 200, stripping the `ok` wrapper", async () => {
    const body = {
      ok: true,
      envelopeFormat: 1,
      keyVersion: 1,
      ciphertext: "cipher",
      nonce: "iv",
      updatedAt: 1_717_200_000_000,
      serverUpdatedAt: 1_717_200_001_000,
    };
    mockFetch({ status: 200, body });
    const result = await pullSync();
    expect(result).toEqual({
      envelopeFormat: 1,
      keyVersion: 1,
      ciphertext: "cipher",
      nonce: "iv",
      updatedAt: 1_717_200_000_000,
      serverUpdatedAt: 1_717_200_001_000,
    });
  });

  it("throws SyncTransportError on other failures (e.g. 500)", async () => {
    mockFetch({ status: 500, body: { ok: false, error: "boom" } });
    await expect(pullSync()).rejects.toBeInstanceOf(SyncTransportError);
  });
});

describe("pushSync", () => {
  const envelope = {
    envelopeFormat: 1 as const,
    keyVersion: 1,
    ciphertext: "AAA",
    nonce: "BBB",
    updatedAt: 1_717_200_000_000,
  };

  it("returns the server-side timestamp on 200", async () => {
    mockFetch({ status: 200, body: { ok: true, serverUpdatedAt: 1_717_200_001_000 } });
    const result = await pushSync(envelope);
    expect(result.serverUpdatedAt).toBe(1_717_200_001_000);
  });

  it("throws SyncUnauthorized on 401", async () => {
    mockFetch({ status: 401, body: { ok: false, error: "Not signed in" } });
    await expect(pushSync(envelope)).rejects.toBeInstanceOf(SyncUnauthorized);
  });

  it("PUTs with credentials:include + JSON body", async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, serverUpdatedAt: 1 }),
    });
    globalThis.fetch = spy as unknown as typeof fetch;
    await pushSync(envelope);
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("/api/workspaces/sync");
    expect(init.method).toBe("PUT");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual(envelope);
  });
});
