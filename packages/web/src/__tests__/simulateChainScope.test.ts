import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { simulateTransaction, simulateBundle } from "../api/simulate";
import {
  forkSimulateApi,
  simulateFromHashApi,
} from "../components/ForkSimulator/api";
import { DEFAULT_CHAIN_ID } from "../lib/chains";

/**
 * The simulate clients thread the chosen chain through `?chainid=N` (the
 * dispatcher param): default chain omits it so requests stay byte-identical
 * to the single-chain era; a non-default chain appends it. The chain never
 * leaks into POST bodies.
 */

const FROM = "0x1111111111111111111111111111111111111111";
const TO = "0x2222222222222222222222222222222222222222";
const TX = `0x${"ab".repeat(32)}`;

function stubFetch(): { url: () => string; body: () => string } {
  let capturedUrl = "";
  let capturedBody = "";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    capturedUrl = String(input);
    capturedBody = String(init?.body ?? "");
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ ok: true, result: { success: true }, results: [] }),
    } as Response;
  });
  return { url: () => capturedUrl, body: () => capturedBody };
}

describe("simulate client chain scoping", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("simulateTransaction appends ?chainid for a non-default chain", async () => {
    const cap = stubFetch();
    await simulateTransaction({ from: FROM, to: TO }, 943);
    expect(cap.url()).toMatch(/\/api\/simulate\?chainid=943\b/);
    expect(JSON.parse(cap.body())).not.toHaveProperty("chainid");
  });

  it("simulateTransaction omits chainid for the default chain (and when omitted)", async () => {
    const cap = stubFetch();
    await simulateTransaction({ from: FROM, to: TO }, DEFAULT_CHAIN_ID);
    expect(cap.url()).not.toContain("chainid");
    await simulateTransaction({ from: FROM, to: TO });
    expect(cap.url()).not.toContain("chainid");
  });

  it("simulateBundle appends ?chainid for a non-default chain", async () => {
    const cap = stubFetch();
    await simulateBundle({ transactions: [{ from: FROM, to: TO }] }, 1);
    expect(cap.url()).toMatch(/\/api\/simulate-bundle\?chainid=1\b/);
  });

  it("forkSimulateApi appends ?chainid for a non-default chain", async () => {
    const cap = stubFetch();
    await forkSimulateApi({ from: FROM, to: TO }, 943);
    expect(cap.url()).toMatch(/\/api\/simulate\/fork\?chainid=943\b/);
    expect(JSON.parse(cap.body())).not.toHaveProperty("chainid");
  });

  it("simulateFromHashApi scopes by chain and keeps the hash in the body", async () => {
    const cap = stubFetch();
    await simulateFromHashApi(TX, 1);
    expect(cap.url()).toMatch(/\/api\/simulate\/from-hash\?chainid=1\b/);
    expect(JSON.parse(cap.body())).toEqual({ txHash: TX });
  });

  it("fork clients omit chainid for the default chain", async () => {
    const cap = stubFetch();
    await forkSimulateApi({ from: FROM, to: TO });
    expect(cap.url()).not.toContain("chainid");
    await simulateFromHashApi(TX, DEFAULT_CHAIN_ID);
    expect(cap.url()).not.toContain("chainid");
  });
});
