import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFork } from "../api/testnets";
import { DEFAULT_CHAIN_ID } from "../lib/chains";

/**
 * `createFork` threads the chosen chain through the `?chainid=N` dispatcher
 * param. The default chain (PulseChain) is omitted so existing requests stay
 * byte-identical; a non-default chain appends the param. The `chainId` field
 * never appears in the POST body — only in the URL.
 */

function stubCreateFork(): { url: () => string; body: () => string } {
  let capturedUrl = "";
  let capturedBody = "";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    capturedUrl = String(input);
    capturedBody = String(init?.body ?? "");
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ ok: true, fork: { id: "f1", chainId: 943 } }),
    } as Response;
  });
  return { url: () => capturedUrl, body: () => capturedBody };
}

describe("createFork chain scoping", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("appends ?chainid for a non-default chain", async () => {
    const cap = stubCreateFork();
    await createFork({ chainId: 943, label: "t" });
    expect(cap.url()).toMatch(/[?&]chainid=943\b/);
  });

  it("omits chainid for the default chain", async () => {
    const cap = stubCreateFork();
    await createFork({ chainId: DEFAULT_CHAIN_ID });
    expect(cap.url()).not.toContain("chainid");
  });

  it("omits chainid when chainId is undefined", async () => {
    const cap = stubCreateFork();
    await createFork({ label: "no chain" });
    expect(cap.url()).not.toContain("chainid");
  });

  it("never leaks chainId into the POST body", async () => {
    const cap = stubCreateFork();
    await createFork({ chainId: 943, label: "t", blockNumber: 100 });
    const parsed = JSON.parse(cap.body()) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("chainId");
    expect(parsed).toMatchObject({ label: "t", blockNumber: 100 });
  });

  it("returns the chainId echoed by the backend", async () => {
    stubCreateFork();
    const fork = await createFork({ chainId: 943 });
    expect(fork.chainId).toBe(943);
  });
});
