import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { toFunctionSelector, toEventSelector } from "viem";
import { buildSelectorMap, buildEventMap } from "../api/contractMeta";

const transferFn = {
  type: "function",
  name: "transfer",
  stateMutability: "nonpayable",
  inputs: [
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [{ type: "bool" }],
} as const;

const transferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
} as const;

describe("buildSelectorMap", () => {
  it("returns an empty map for an empty ABI array", () => {
    expect(buildSelectorMap([])).toEqual({});
  });

  it("returns an empty map for a non-array input", () => {
    expect(buildSelectorMap(null)).toEqual({});
    expect(buildSelectorMap(undefined)).toEqual({});
    expect(buildSelectorMap({})).toEqual({});
    expect(buildSelectorMap("not an abi")).toEqual({});
  });

  it("maps a single function selector to its name", () => {
    const sel = toFunctionSelector(transferFn).toLowerCase();
    const map = buildSelectorMap([transferFn]);
    expect(map).toEqual({ [sel]: "transfer" });
  });

  it("skips non-function entries (events, errors, constructors)", () => {
    const map = buildSelectorMap([
      transferEvent,
      { type: "constructor", inputs: [] },
      { type: "error", name: "Boom", inputs: [] },
      { type: "fallback" },
    ]);
    expect(map).toEqual({});
  });

  it("includes only the function from a mixed ABI", () => {
    const sel = toFunctionSelector(transferFn).toLowerCase();
    const map = buildSelectorMap([transferFn, transferEvent]);
    expect(Object.keys(map)).toEqual([sel]);
  });

  it("skips malformed entries without crashing", () => {
    const sel = toFunctionSelector(transferFn).toLowerCase();
    const map = buildSelectorMap([
      transferFn,
      // Missing required fields — viem's toFunctionSelector throws; we swallow.
      { type: "function" },
      null,
      undefined,
    ]);
    expect(map).toEqual({ [sel]: "transfer" });
  });
});

describe("buildEventMap", () => {
  it("returns an empty map for an empty ABI array", () => {
    expect(buildEventMap([])).toEqual({});
  });

  it("returns an empty map for a non-array input", () => {
    expect(buildEventMap(null)).toEqual({});
    expect(buildEventMap(undefined)).toEqual({});
    expect(buildEventMap(42)).toEqual({});
  });

  it("maps a single event topic0 to its canonical signature", () => {
    const topic0 = toEventSelector(transferEvent).toLowerCase();
    const map = buildEventMap([transferEvent]);
    expect(map).toEqual({ [topic0]: "Transfer(address,address,uint256)" });
  });

  it("skips non-event entries (functions, errors, constructors)", () => {
    const map = buildEventMap([
      transferFn,
      { type: "error", name: "Boom", inputs: [] },
      { type: "constructor", inputs: [] },
    ]);
    expect(map).toEqual({});
  });

  it("includes only the event from a mixed ABI", () => {
    const topic0 = toEventSelector(transferEvent).toLowerCase();
    const map = buildEventMap([transferFn, transferEvent]);
    expect(Object.keys(map)).toEqual([topic0]);
  });

  it("handles an event with no inputs (empty parameter list)", () => {
    const paused = {
      type: "event",
      name: "Paused",
      inputs: [],
    } as const;
    const topic0 = toEventSelector(paused).toLowerCase();
    const map = buildEventMap([paused]);
    expect(map).toEqual({ [topic0]: "Paused()" });
  });

  it("skips malformed entries without crashing", () => {
    const topic0 = toEventSelector(transferEvent).toLowerCase();
    const map = buildEventMap([
      transferEvent,
      { type: "event" },
      null,
      undefined,
    ]);
    expect(map).toEqual({ [topic0]: "Transfer(address,address,uint256)" });
  });
});

// ---------------------------------------------------------------------------
// resolveContractMeta — Etherscan envelope handling, cache discipline
//
// The module under test holds a private cache at module scope. We isolate
// each test by `vi.resetModules()` + re-importing so cache state from one
// test doesn't bleed into the next. Each test stubs globalThis.fetch with
// a per-test envelope response.
// ---------------------------------------------------------------------------

describe("resolveContractMeta — envelope error handling", () => {
  type ResolveFn = (typeof import("../api/contractMeta"))["resolveContractMeta"];
  let resolveContractMeta: ResolveFn;

  beforeEach(async () => {
    vi.resetModules();
    ({ resolveContractMeta } = await import("../api/contractMeta"));
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubFetch(envelope: unknown, opts: { ok?: boolean; status?: number } = {}) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: async () => envelope,
    } as Response);
  }

  it("flags an upstream-unavailable response as transient and DOES NOT cache it", async () => {
    const fetchSpy = stubFetch({
      status: "0",
      message: "NOTOK",
      result: "Verification source temporarily unavailable: blockscout+sourcify",
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const addr = "0xefd2ab7e09f436e8d29bb04df76a9dec77e5f0a3";

    const first = await resolveContractMeta([addr]);
    expect(first[addr]).toEqual({
      name: null,
      selectors: {},
      events: {},
      transient: true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("verification upstream unavailable"),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second resolve must re-fetch — transient results must never poison
    // the module-level cache.
    await resolveContractMeta([addr]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("caches a genuine 'not verified' miss (status=1, placeholder ABI)", async () => {
    const fetchSpy = stubFetch({
      status: "1",
      message: "OK",
      result: [
        {
          SourceCode: "",
          ABI: "Contract source code not verified",
          ContractName: "",
        },
      ],
    });

    const addr = "0xdeadbeef00000000000000000000000000000face";

    const first = await resolveContractMeta([addr]);
    expect(first[addr]).toEqual({ name: null, selectors: {}, events: {} });
    expect(first[addr]!.transient).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second resolve served from cache — no extra fetch.
    await resolveContractMeta([addr]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("parses ABI + name and caches verified-contract meta", async () => {
    const abi = [transferFn, transferEvent];
    stubFetch({
      status: "1",
      message: "OK",
      result: [
        {
          SourceCode: "// not parsed",
          ABI: JSON.stringify(abi),
          ContractName: "MockERC20",
        },
      ],
    });

    const addr = "0xabcdef0000000000000000000000000000000001";
    const result = await resolveContractMeta([addr]);
    const meta = result[addr]!;

    expect(meta.name).toBe("MockERC20");
    expect(Object.values(meta.selectors)).toContain("transfer");
    expect(Object.values(meta.events)).toContain(
      "Transfer(address,address,uint256)",
    );
    expect(meta.transient).toBeUndefined();
  });

  it("treats non-2xx HTTP responses as transient (does not cache)", async () => {
    const fetchSpy = stubFetch(null, { ok: false, status: 502 });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const addr = "0x1111111111111111111111111111111111111111";

    const first = await resolveContractMeta([addr]);
    expect(first[addr]!.transient).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("HTTP 502"),
    );

    await resolveContractMeta([addr]);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // re-fetch, not from cache
  });
});
