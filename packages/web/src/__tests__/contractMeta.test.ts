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

describe("resolveContractMeta — envelope error handling + retry", () => {
  type ResolveFn = (typeof import("../api/contractMeta"))["resolveContractMeta"];
  let resolveContractMeta: ResolveFn;

  beforeEach(async () => {
    // Fake timers so the retry sleeps don't actually block the test
    // suite. Each test calls `vi.runAllTimersAsync()` to flush the
    // backoff schedule between attempts.
    vi.useFakeTimers();
    vi.resetModules();
    ({ resolveContractMeta } = await import("../api/contractMeta"));
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function envelopeResponse(
    envelope: unknown,
    opts: { ok?: boolean; status?: number } = {},
  ): Response {
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: async () => envelope,
    } as Response;
  }

  const UPSTREAM_DOWN = {
    status: "0",
    message: "NOTOK",
    result: "Verification source temporarily unavailable: blockscout+sourcify",
  };
  const NOT_VERIFIED_OK = {
    status: "1",
    message: "OK",
    result: [
      {
        SourceCode: "",
        ABI: "Contract source code not verified",
        ContractName: "",
      },
    ],
  };

  it("omits an address from the result when every retry returns transient", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(envelopeResponse(UPSTREAM_DOWN));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const addr = "0xefd2ab7e09f436e8d29bb04df76a9dec77e5f0a3";

    const pending = resolveContractMeta([addr]);
    await vi.runAllTimersAsync();
    const first = await pending;

    // Definitive answers only. A transient upstream → no entry in the result.
    expect(first[addr]).toBeUndefined();
    expect(Object.keys(first)).toEqual([]);

    // All three attempts were made; warning logged once on the final attempt.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/giving up on .* after 3 attempts/i),
    );

    // Next call refetches — transient never poisons the cache.
    const pending2 = resolveContractMeta([addr]);
    await vi.runAllTimersAsync();
    await pending2;
    expect(fetchSpy).toHaveBeenCalledTimes(6); // 3 more
  });

  it("recovers when a transient attempt is followed by a definitive one", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(envelopeResponse(UPSTREAM_DOWN))
      .mockResolvedValueOnce(envelopeResponse(NOT_VERIFIED_OK));

    const addr = "0xdeadbeef00000000000000000000000000000face";

    const pending = resolveContractMeta([addr]);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result[addr]).toEqual({ name: null, selectors: {}, events: {} });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("caches a genuine 'not verified' miss after first definitive answer", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(envelopeResponse(NOT_VERIFIED_OK));

    const addr = "0xdeadbeef00000000000000000000000000000face";

    const pending = resolveContractMeta([addr]);
    await vi.runAllTimersAsync();
    const first = await pending;
    expect(first[addr]).toEqual({ name: null, selectors: {}, events: {} });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second resolve served from cache — no extra fetch.
    const pending2 = resolveContractMeta([addr]);
    await vi.runAllTimersAsync();
    await pending2;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("parses ABI + name and caches verified-contract meta", async () => {
    const abi = [transferFn, transferEvent];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      envelopeResponse({
        status: "1",
        message: "OK",
        result: [
          {
            SourceCode: "// not parsed",
            ABI: JSON.stringify(abi),
            ContractName: "MockERC20",
          },
        ],
      }),
    );

    const addr = "0xabcdef0000000000000000000000000000000001";

    const pending = resolveContractMeta([addr]);
    await vi.runAllTimersAsync();
    const result = await pending;
    const meta = result[addr]!;

    expect(meta.name).toBe("MockERC20");
    expect(Object.values(meta.selectors)).toContain("transfer");
    expect(Object.values(meta.events)).toContain(
      "Transfer(address,address,uint256)",
    );
  });

  it("treats sustained non-2xx HTTP as transient — omits + retries next call", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(envelopeResponse(null, { ok: false, status: 502 }));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const addr = "0x1111111111111111111111111111111111111111";

    const pending = resolveContractMeta([addr]);
    await vi.runAllTimersAsync();
    const first = await pending;

    expect(first[addr]).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/HTTP 502/i),
    );

    const pending2 = resolveContractMeta([addr]);
    await vi.runAllTimersAsync();
    await pending2;
    expect(fetchSpy).toHaveBeenCalledTimes(6); // 3 retries × 2 rounds — never cached
  });
});
