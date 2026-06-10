import { describe, it, expect } from "vitest";
import { deepLinkForMatch } from "../lib/watcher/deepLink";
import type { WatchMatch } from "../lib/watcher/types";

/**
 * The deep-link policy is a pure map from a fired match to an in-app path:
 * a mined match → its `/tx/:hash`, a hash-less match → its owning workspace.
 * Tested as a plain function — no router, no DOM.
 */

function mk(overrides: Partial<WatchMatch> = {}): WatchMatch {
  return {
    id: "m1",
    ruleId: "r1",
    workspaceId: "w1",
    chainId: 369,
    kind: "erc20_transfer",
    label: "Token transfers",
    at: 0,
    lead: "Transfer ",
    amount: null,
    trail: "",
    txHash: "0xabc",
    blockNumber: "100",
    ...overrides,
  };
}

describe("watcher/deepLink — deepLinkForMatch", () => {
  it("routes a mined match to its transaction", () => {
    expect(deepLinkForMatch(mk({ txHash: "0xdeadbeef" }))).toBe(
      "/tx/0xdeadbeef",
    );
  });

  it("routes both kinds to /tx when a hash is present", () => {
    expect(deepLinkForMatch(mk({ kind: "address_activity" }))).toBe("/tx/0xabc");
    expect(deepLinkForMatch(mk({ kind: "erc20_transfer" }))).toBe("/tx/0xabc");
  });

  it("falls back to the owning workspace when there is no tx hash", () => {
    expect(deepLinkForMatch(mk({ txHash: undefined, workspaceId: "w7" }))).toBe(
      "/workspace/w7",
    );
  });
});
