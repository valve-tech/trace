import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGasOracle } from "./gas";
import { fetchPending } from "./mempool";
import {
  fetchRpcStats,
  fetchRpcMethods,
  testRpcRequest,
  sendRpcRequest,
} from "./rpc";

/**
 * Chain-coverage pass: gas / mempool / rpc API clients must append `?chainid=N`
 * for non-default chains and stay byte-identical (no param) for the default
 * chain (369) — matching explorer.ts's private `scoped` helper.
 */

const DEFAULT_CHAIN = 369;
const OTHER_CHAIN = 943;

function okResponse(): Response {
  return {
    ok: true,
    json: async () => ({ ok: true, result: {}, methods: [], response: {} }),
    text: async () => "",
  } as unknown as Response;
}

function lastUrl(spy: ReturnType<typeof vi.fn>): string {
  const call = spy.mock.calls.at(-1);
  return String(call?.[0]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gas oracle chain scoping", () => {
  it("omits chainid for the default chain", async () => {
    const spy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", spy);
    await fetchGasOracle(DEFAULT_CHAIN);
    expect(lastUrl(spy)).toBe("/api/gas/oracle");
  });

  it("defaults to the default chain when no arg is given", async () => {
    const spy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", spy);
    await fetchGasOracle();
    expect(lastUrl(spy)).toBe("/api/gas/oracle");
  });

  it("appends chainid for a non-default chain", async () => {
    const spy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", spy);
    await fetchGasOracle(OTHER_CHAIN);
    expect(lastUrl(spy)).toBe(`/api/gas/oracle?chainid=${OTHER_CHAIN}`);
  });
});

describe("mempool chain scoping", () => {
  it("omits chainid for the default chain", async () => {
    const spy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", spy);
    await fetchPending(DEFAULT_CHAIN);
    expect(lastUrl(spy)).toBe("/api/mempool/pending");
  });

  it("appends chainid for a non-default chain", async () => {
    const spy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", spy);
    await fetchPending(OTHER_CHAIN);
    expect(lastUrl(spy)).toBe(`/api/mempool/pending?chainid=${OTHER_CHAIN}`);
  });
});

describe("rpc playground chain scoping", () => {
  it("scopes stats + methods (GET) only for non-default chains", async () => {
    const spy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", spy);

    await fetchRpcStats(DEFAULT_CHAIN);
    expect(lastUrl(spy)).toBe("/api/rpc/stats");
    await fetchRpcStats(OTHER_CHAIN);
    expect(lastUrl(spy)).toBe(`/api/rpc/stats?chainid=${OTHER_CHAIN}`);

    await fetchRpcMethods(OTHER_CHAIN);
    expect(lastUrl(spy)).toBe(`/api/rpc/methods?chainid=${OTHER_CHAIN}`);
  });

  it("scopes the tester POST endpoint", async () => {
    const spy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", spy);

    const req = { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] };
    await testRpcRequest(req, DEFAULT_CHAIN);
    expect(lastUrl(spy)).toBe("/api/rpc/test");
    await testRpcRequest(req, OTHER_CHAIN);
    expect(lastUrl(spy)).toBe(`/api/rpc/test?chainid=${OTHER_CHAIN}`);
  });

  it("scopes the raw /rpc endpoint", async () => {
    const spy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", spy);

    const req = { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] };
    await sendRpcRequest(req, DEFAULT_CHAIN);
    expect(lastUrl(spy)).toBe("/rpc");
    await sendRpcRequest(req, OTHER_CHAIN);
    expect(lastUrl(spy)).toBe(`/rpc?chainid=${OTHER_CHAIN}`);
  });
});
