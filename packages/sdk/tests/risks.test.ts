import { describe, it, expect } from "vitest";
import type { Address } from "viem";
import { analyzeRisks } from "../src/risks/index.js";
import { addrs, makeFrame } from "./fixtures.js";

describe("analyzeRisks", () => {
  it("returns empty array for a trace with no delegatecalls", () => {
    const frame = makeFrame({
      type: "CALL",
      children: [makeFrame({ type: "STATICCALL", depth: 1 })],
    });
    expect(analyzeRisks(frame)).toEqual([]);
  });

  it("flags a DELEGATECALL with no whitelist as danger, not reverted", () => {
    const frame = makeFrame({
      type: "CALL",
      children: [
        makeFrame({
          type: "DELEGATECALL",
          from: addrs.CONTRACT,
          to: addrs.VAULT,
          depth: 1,
        }),
      ],
    });
    const flags = analyzeRisks(frame);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toEqual({
      type: "DELEGATECALL_UNRECOGNIZED",
      severity: "danger",
      message: `DELEGATECALL to non-whitelisted address ${addrs.VAULT}`,
      address: addrs.VAULT,
      depth: 1,
      childIndex: 0,
      reverted: false,
    });
  });

  it("suppresses DELEGATECALL when target is in whitelist", () => {
    const frame = makeFrame({
      type: "CALL",
      children: [
        makeFrame({
          type: "DELEGATECALL",
          from: addrs.CONTRACT,
          to: addrs.VAULT,
          depth: 1,
        }),
      ],
    });
    const whitelist = new Set<Address>([addrs.VAULT]);
    expect(analyzeRisks(frame, { whitelist })).toEqual([]);
  });

  it("does not flag DELEGATECALL with null `to`", () => {
    // Defensive: well-formed traces won't have this, but the rule must not
    // produce a flag with `address: null` and an "undefined" message.
    const frame = makeFrame({
      type: "DELEGATECALL",
      to: null,
    });
    expect(analyzeRisks(frame)).toEqual([]);
  });

  it("flags risks inside reverted subtrees with reverted: true", () => {
    // Per audit semantics: a delegatecall whose surrounding call later
    // reverted is still meaningful — it represents a code path that was
    // exercised. We surface it tagged so consumers can filter if they want.
    const frame = makeFrame({
      type: "CALL",
      children: [
        makeFrame({
          type: "CALL",
          to: addrs.CONTRACT,
          error: "execution reverted",
          depth: 1,
          children: [
            makeFrame({
              type: "DELEGATECALL",
              from: addrs.CONTRACT,
              to: addrs.VAULT,
              depth: 2,
            }),
          ],
        }),
        makeFrame({
          type: "DELEGATECALL",
          from: addrs.CONTRACT,
          to: addrs.BOB,
          depth: 1,
        }),
      ],
    });
    const flags = analyzeRisks(frame);
    expect(flags).toHaveLength(2);
    // First flag is inside the reverted subtree.
    expect(flags[0].address).toBe(addrs.VAULT);
    expect(flags[0].reverted).toBe(true);
    // Second is in the successful sibling.
    expect(flags[1].address).toBe(addrs.BOB);
    expect(flags[1].reverted).toBe(false);
  });

  it("marks the directly-reverted frame's findings as reverted: true", () => {
    // The DELEGATECALL frame itself reverted — its own flag should be
    // tagged reverted, even though no ancestor reverted.
    const frame = makeFrame({
      type: "DELEGATECALL",
      to: addrs.VAULT,
      error: "execution reverted",
    });
    const flags = analyzeRisks(frame);
    expect(flags[0].reverted).toBe(true);
  });

  it("unwinds the reverted-ancestor counter correctly across siblings", () => {
    // After a reverted subtree exits, the next sibling should be in a clean
    // (non-reverted) context again. This catches a stack-discipline bug
    // where the exit hook forgot to decrement.
    const frame = makeFrame({
      type: "CALL",
      children: [
        makeFrame({
          type: "CALL",
          error: "execution reverted",
          depth: 1,
          children: [
            makeFrame({
              type: "DELEGATECALL",
              to: addrs.VAULT,
              depth: 2,
            }),
          ],
        }),
        makeFrame({
          type: "DELEGATECALL",
          to: addrs.BOB,
          depth: 1,
        }),
      ],
    });
    const flags = analyzeRisks(frame);
    expect(flags.find((f) => f.address === addrs.VAULT)?.reverted).toBe(true);
    expect(flags.find((f) => f.address === addrs.BOB)?.reverted).toBe(false);
  });

  it("captures depth and childIndex correctly across siblings", () => {
    const frame = makeFrame({
      type: "CALL",
      children: [
        makeFrame({ type: "STATICCALL", depth: 1 }),
        makeFrame({
          type: "DELEGATECALL",
          to: addrs.VAULT,
          depth: 1,
        }),
        makeFrame({ type: "STATICCALL", depth: 1 }),
        makeFrame({
          type: "DELEGATECALL",
          to: addrs.BOB,
          depth: 1,
        }),
      ],
    });
    const flags = analyzeRisks(frame);
    expect(flags.map((f) => f.childIndex)).toEqual([1, 3]);
    expect(flags.map((f) => f.address)).toEqual([addrs.VAULT, addrs.BOB]);
  });

  it("uses default empty options when none supplied", () => {
    const frame = makeFrame({
      type: "DELEGATECALL",
      to: addrs.VAULT,
    });
    expect(analyzeRisks(frame)).toHaveLength(1);
  });
});
