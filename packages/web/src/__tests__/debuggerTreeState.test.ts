import { describe, it, expect, beforeEach } from "vitest";
import {
  loadTreeExpandState,
  saveTreeExpandState,
  pruneStaleTreeState,
} from "../lib/debuggerTreeState";

const TX = "0xABCDEF";

describe("debuggerTreeState", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips overrides scoped by chain + tx (case-insensitive hash)", () => {
    saveTreeExpandState(TX, { "f:1:2:foo": false });
    expect(loadTreeExpandState(TX.toLowerCase())).toEqual({ "f:1:2:foo": false });
    // stored under the chain-scoped, lowercased key
    expect(localStorage.getItem("debugger:tree-expand:369:0xabcdef")).toContain("updatedAt");
  });

  it("keeps a different chain's state separate", () => {
    saveTreeExpandState(TX, { a: true }, 1);
    saveTreeExpandState(TX, { b: true }, 369);
    expect(loadTreeExpandState(TX, 1)).toEqual({ a: true });
    expect(loadTreeExpandState(TX, 369)).toEqual({ b: true });
  });

  it("tolerates the legacy flat shape (pre-updatedAt)", () => {
    localStorage.setItem("debugger:tree-expand:369:0xabcdef", JSON.stringify({ "f:9:9:x": false }));
    expect(loadTreeExpandState(TX)).toEqual({ "f:9:9:x": false });
  });

  it("returns an empty map for unknown or corrupt entries", () => {
    expect(loadTreeExpandState("0xmissing")).toEqual({});
    localStorage.setItem("debugger:tree-expand:369:0xbad", "{not json");
    expect(loadTreeExpandState("0xbad")).toEqual({});
  });

  it("prunes entries older than the max age but keeps fresh ones", () => {
    const old = Date.now() - 1000 * 60 * 60 * 24 * 90; // 90 days
    localStorage.setItem(
      "debugger:tree-expand:369:0xold",
      JSON.stringify({ updatedAt: old, overrides: { a: false } }),
    );
    saveTreeExpandState(TX, { b: true }); // fresh
    pruneStaleTreeState();
    expect(localStorage.getItem("debugger:tree-expand:369:0xold")).toBeNull();
    expect(loadTreeExpandState(TX)).toEqual({ b: true });
  });
});
