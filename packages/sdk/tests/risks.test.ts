import { describe, it, expect } from "vitest";
import type { Address, Hex } from "viem";
import { analyzeRisks } from "../src/risks/index.js";
import { addrs, makeFrame } from "./fixtures.js";
import type { Log, TraceFrame } from "../src/types.js";

const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const UINT256_MAX = 2n ** 256n - 1n;

function addrTopic(address: Address): Hex {
  return (`0x000000000000000000000000${address.slice(2)}`).toLowerCase() as Hex;
}

function uint256Hex(n: bigint): Hex {
  return (`0x${n.toString(16).padStart(64, "0")}`) as Hex;
}

function approvalLog(
  token: Address,
  owner: Address,
  spender: Address,
  value: bigint,
): Log {
  return {
    address: token,
    topics: [APPROVAL_TOPIC as Hex, addrTopic(owner), addrTopic(spender)],
    data: uint256Hex(value),
  };
}

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

describe("analyzeRisks — largeApproval rule", () => {
  it("flags an Approval at uint256.max with warning severity", () => {
    const frame: TraceFrame = {
      ...makeFrame({ to: addrs.CONTRACT }),
      logs: [approvalLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, UINT256_MAX)],
    };
    const flags = analyzeRisks(frame);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toEqual({
      type: "LARGE_APPROVAL",
      severity: "warning",
      message: `Large ERC-20 approval to ${addrs.BOB} (value ${UINT256_MAX})`,
      address: addrs.BOB,
      depth: 0,
      childIndex: 0,
      reverted: false,
    });
  });

  it("does not flag a small Approval at default threshold", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [approvalLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, 1_000n)],
    };
    expect(analyzeRisks(frame)).toEqual([]);
  });

  it("flags everything >= a lowered threshold", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        approvalLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, 2n ** 128n),
        approvalLog(addrs.CONTRACT, addrs.ALICE, addrs.VAULT, 1_000n),
      ],
    };
    const flags = analyzeRisks(frame, { largeApprovalThreshold: 2n ** 128n });
    expect(flags).toHaveLength(1);
    expect(flags[0].address).toBe(addrs.BOB);
  });

  it("emits one flag per large Approval log on the same frame", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        approvalLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, UINT256_MAX),
        approvalLog(addrs.CONTRACT, addrs.ALICE, addrs.VAULT, UINT256_MAX),
      ],
    };
    const flags = analyzeRisks(frame);
    expect(flags).toHaveLength(2);
    expect(flags.map((f) => f.address)).toEqual([addrs.BOB, addrs.VAULT]);
  });

  it("ignores ERC-721 Approval (4 topics) and non-Approval logs", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          // ERC-721 Approval — 4 topics
          address: addrs.CONTRACT,
          topics: [
            APPROVAL_TOPIC as Hex,
            addrTopic(addrs.ALICE),
            addrTopic(addrs.BOB),
            uint256Hex(42n),
          ],
          data: "0x" as Hex,
        },
        {
          // Transfer topic — not an Approval
          address: addrs.CONTRACT,
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex,
            addrTopic(addrs.ALICE),
            addrTopic(addrs.BOB),
          ],
          data: uint256Hex(UINT256_MAX),
        },
      ],
    };
    expect(analyzeRisks(frame)).toEqual([]);
  });

  it("ignores Approval-shaped logs with unparseable value data", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          address: addrs.CONTRACT,
          topics: [APPROVAL_TOPIC as Hex, addrTopic(addrs.ALICE), addrTopic(addrs.BOB)],
          data: "garbage" as Hex,
        },
      ],
    };
    expect(analyzeRisks(frame)).toEqual([]);
  });

  it("ignores Approval-shaped logs with malformed topic lengths", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          address: addrs.CONTRACT,
          topics: [APPROVAL_TOPIC as Hex, "0x1234" as Hex, addrTopic(addrs.BOB)],
          data: uint256Hex(UINT256_MAX),
        },
        {
          address: addrs.CONTRACT,
          topics: [APPROVAL_TOPIC as Hex, addrTopic(addrs.ALICE), "0x5678" as Hex],
          data: uint256Hex(UINT256_MAX),
        },
      ],
    };
    expect(analyzeRisks(frame)).toEqual([]);
  });

  it("stamps reverted: true on flags from reverted subtrees", () => {
    const frame = makeFrame({
      type: "CALL",
      children: [
        {
          ...makeFrame({
            type: "CALL",
            depth: 1,
            error: "execution reverted",
          }),
          logs: [approvalLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, UINT256_MAX)],
        },
      ],
    });
    const flags = analyzeRisks(frame);
    expect(flags).toHaveLength(1);
    expect(flags[0].reverted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tokenSentToTokenContract rule
// ---------------------------------------------------------------------------

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function transferLog(
  token: Address,
  from: Address,
  to: Address,
  value: bigint,
): Log {
  return {
    address: token,
    topics: [TRANSFER_TOPIC as Hex, addrTopic(from), addrTopic(to)],
    data: uint256Hex(value),
  };
}

describe("analyzeRisks — tokenSentToTokenContract rule", () => {
  it("flags a Transfer whose `to` is the emitting token contract", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [transferLog(addrs.CONTRACT, addrs.ALICE, addrs.CONTRACT, 100n)],
    };
    const flags = analyzeRisks(frame).filter(
      (f) => f.type === "TOKEN_SENT_TO_TOKEN_CONTRACT",
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]).toEqual({
      type: "TOKEN_SENT_TO_TOKEN_CONTRACT",
      severity: "warning",
      message: `ERC-20 Transfer to token's own contract ${addrs.CONTRACT} (funds unrecoverable)`,
      address: addrs.CONTRACT,
      depth: 0,
      childIndex: 0,
      reverted: false,
    });
  });

  it("does NOT flag a Transfer to a normal EOA", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [transferLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, 100n)],
    };
    expect(
      analyzeRisks(frame).filter((f) => f.type === "TOKEN_SENT_TO_TOKEN_CONTRACT"),
    ).toEqual([]);
  });

  it("flags Transfers to a different token contract when classifyAddress returns true", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [transferLog(addrs.CONTRACT, addrs.ALICE, addrs.VAULT, 100n)],
    };
    const flags = analyzeRisks(frame, {
      classifyAddress: (addr) => addr === addrs.VAULT,
    }).filter((f) => f.type === "TOKEN_SENT_TO_TOKEN_CONTRACT");
    expect(flags).toHaveLength(1);
    expect(flags[0]!.message).toContain("a different token contract");
    expect(flags[0]!.address).toBe(addrs.VAULT);
  });

  it("does not flag cross-token when classifyAddress returns false", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [transferLog(addrs.CONTRACT, addrs.ALICE, addrs.VAULT, 100n)],
    };
    expect(
      analyzeRisks(frame, { classifyAddress: () => false }).filter(
        (f) => f.type === "TOKEN_SENT_TO_TOKEN_CONTRACT",
      ),
    ).toEqual([]);
  });

  it("self-transfers are always flagged, even when classifyAddress is omitted", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [transferLog(addrs.CONTRACT, addrs.ALICE, addrs.CONTRACT, 1n)],
    };
    expect(
      analyzeRisks(frame).filter((f) => f.type === "TOKEN_SENT_TO_TOKEN_CONTRACT"),
    ).toHaveLength(1);
  });

  it("ignores logs that are not ERC-20 Transfers", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      // Approval, not Transfer
      logs: [approvalLog(addrs.CONTRACT, addrs.ALICE, addrs.CONTRACT, 1n)],
    };
    expect(
      analyzeRisks(frame).filter((f) => f.type === "TOKEN_SENT_TO_TOKEN_CONTRACT"),
    ).toEqual([]);
  });

  it("ignores 4-topic (ERC-721) Transfers even if `to` equals the token", () => {
    const erc721: Log = {
      address: addrs.CONTRACT,
      topics: [
        TRANSFER_TOPIC as Hex,
        addrTopic(addrs.ALICE),
        addrTopic(addrs.CONTRACT),
        uint256Hex(1n),
      ],
      data: "0x" as Hex,
    };
    const frame: TraceFrame = { ...makeFrame({}), logs: [erc721] };
    expect(
      analyzeRisks(frame).filter((f) => f.type === "TOKEN_SENT_TO_TOKEN_CONTRACT"),
    ).toEqual([]);
  });

  it("ignores malformed 3-topic logs with bad topic length", () => {
    const bad: Log = {
      address: addrs.CONTRACT,
      topics: [
        TRANSFER_TOPIC as Hex,
        addrTopic(addrs.ALICE),
        // truncated `to` topic
        ("0x" + "00".repeat(20)) as Hex,
      ],
      data: uint256Hex(1n),
    };
    const frame: TraceFrame = { ...makeFrame({}), logs: [bad] };
    expect(
      analyzeRisks(frame).filter((f) => f.type === "TOKEN_SENT_TO_TOKEN_CONTRACT"),
    ).toEqual([]);
  });

  it("returns no flags when the frame has no logs", () => {
    expect(
      analyzeRisks(makeFrame({})).filter(
        (f) => f.type === "TOKEN_SENT_TO_TOKEN_CONTRACT",
      ),
    ).toEqual([]);
  });

  it("flags multiple offenders on one frame, in log order", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        transferLog(addrs.CONTRACT, addrs.ALICE, addrs.CONTRACT, 1n),
        transferLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, 2n),
        transferLog(addrs.CONTRACT, addrs.ALICE, addrs.CONTRACT, 3n),
      ],
    };
    const flags = analyzeRisks(frame).filter(
      (f) => f.type === "TOKEN_SENT_TO_TOKEN_CONTRACT",
    );
    expect(flags).toHaveLength(2);
  });
});
