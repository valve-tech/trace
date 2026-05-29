import { describe, it, expect } from "vitest";
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
