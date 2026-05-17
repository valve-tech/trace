import { describe, it, expect } from "vitest";
import type { Address, Hex } from "viem";
import {
  parseTokenDeltas,
  parsePrestateDiff,
  parseApprovals,
} from "../src/parsers/index.js";
import { normalizeCallFrame } from "../src/loaders/normalize.js";
import { addrs, makeFrame } from "./fixtures.js";
import type {
  Log,
  RawCallFrame,
  RawPrestateDiff,
  TraceFrame,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// parseTokenDeltas
// ---------------------------------------------------------------------------

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function addrTopic(address: Address): Hex {
  return (`0x000000000000000000000000${address.slice(2)}`).toLowerCase() as Hex;
}

function uint256Hex(n: bigint): Hex {
  return (`0x${n.toString(16).padStart(64, "0")}`) as Hex;
}

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

describe("parseTokenDeltas", () => {
  it("returns empty array when no logs", () => {
    const frame = makeFrame({});
    expect(parseTokenDeltas(frame)).toEqual([]);
  });

  it("decodes a single ERC-20 Transfer event", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [transferLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, 1_000n)],
    };
    const deltas = parseTokenDeltas(frame);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toEqual({
      token: addrs.CONTRACT,
      from: addrs.ALICE,
      to: addrs.BOB,
      value: 1_000n,
      logIndex: 0,
    });
  });

  it("collects logs from nested frames with monotonic logIndex", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [transferLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, 1n)],
      children: [
        {
          ...makeFrame({ depth: 1, from: addrs.CONTRACT, to: addrs.VAULT }),
          logs: [transferLog(addrs.VAULT, addrs.BOB, addrs.ALICE, 2n)],
        },
      ],
    };
    const deltas = parseTokenDeltas(frame);
    expect(deltas.map((d) => d.logIndex)).toEqual([0, 1]);
    expect(deltas[1].value).toBe(2n);
  });

  it("skips reverted frames AND their subtree", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [transferLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, 1n)],
      children: [
        {
          // This reverted frame and any logs inside it are rolled back.
          ...makeFrame({
            depth: 1,
            from: addrs.CONTRACT,
            to: addrs.VAULT,
            error: "execution reverted",
          }),
          logs: [transferLog(addrs.VAULT, addrs.BOB, addrs.ALICE, 999n)],
          children: [
            {
              ...makeFrame({ depth: 2, from: addrs.VAULT, to: addrs.BOB }),
              logs: [transferLog(addrs.VAULT, addrs.BOB, addrs.ALICE, 888n)],
            },
          ],
        },
        {
          // Sibling of the reverted frame is fine.
          ...makeFrame({ depth: 1, from: addrs.CONTRACT, to: addrs.BOB }),
          logs: [transferLog(addrs.BOB, addrs.CONTRACT, addrs.ALICE, 3n)],
        },
      ],
    };
    const deltas = parseTokenDeltas(frame);
    expect(deltas).toHaveLength(2);
    expect(deltas.map((d) => d.value)).toEqual([1n, 3n]);
  });

  it("filters ERC-721 Transfer (4 topics) — same hash, indexed tokenId", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          address: addrs.CONTRACT,
          topics: [
            TRANSFER_TOPIC as Hex,
            addrTopic(addrs.ALICE),
            addrTopic(addrs.BOB),
            uint256Hex(42n), // tokenId indexed → 4th topic
          ],
          data: "0x" as Hex,
        },
      ],
    };
    expect(parseTokenDeltas(frame)).toEqual([]);
  });

  it("ignores non-Transfer logs", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          address: addrs.CONTRACT,
          // Approval topic: keccak("Approval(address,address,uint256)")
          topics: [
            "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925" as Hex,
            addrTopic(addrs.ALICE),
            addrTopic(addrs.BOB),
          ],
          data: uint256Hex(1n),
        },
      ],
    };
    expect(parseTokenDeltas(frame)).toEqual([]);
  });

  it("increments logIndex even when log is not a Transfer", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          address: addrs.CONTRACT,
          topics: ["0xdeadbeef" as Hex],
          data: "0x" as Hex,
        },
        transferLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, 5n),
      ],
    };
    const deltas = parseTokenDeltas(frame);
    expect(deltas).toHaveLength(1);
    // logIndex reflects position in the successful log stream,
    // including the non-Transfer one we skipped over.
    expect(deltas[0].logIndex).toBe(1);
  });

  it("returns null for malformed from-topic length", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          address: addrs.CONTRACT,
          topics: [TRANSFER_TOPIC as Hex, "0x1234" as Hex, addrTopic(addrs.BOB)],
          data: uint256Hex(1n),
        },
      ],
    };
    expect(parseTokenDeltas(frame)).toEqual([]);
  });

  it("returns null for malformed to-topic length", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          address: addrs.CONTRACT,
          topics: [TRANSFER_TOPIC as Hex, addrTopic(addrs.ALICE), "0x5678" as Hex],
          data: uint256Hex(1n),
        },
      ],
    };
    expect(parseTokenDeltas(frame)).toEqual([]);
  });

  it("returns null for unparseable value", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          address: addrs.CONTRACT,
          topics: [TRANSFER_TOPIC as Hex, addrTopic(addrs.ALICE), addrTopic(addrs.BOB)],
          data: "garbage" as Hex,
        },
      ],
    };
    expect(parseTokenDeltas(frame)).toEqual([]);
  });

  it("works on a raw frame via normalizeCallFrame", () => {
    const raw: RawCallFrame = {
      type: "CALL",
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gas: "0x10000",
      gasUsed: "0x1000",
      input: "0xa9059cbb",
      output: "0x",
      logs: [
        {
          address: addrs.CONTRACT,
          topics: [TRANSFER_TOPIC, addrTopic(addrs.ALICE), addrTopic(addrs.BOB)],
          data: uint256Hex(7n),
        },
      ],
    };
    const frame = normalizeCallFrame(raw);
    const deltas = parseTokenDeltas(frame);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].value).toBe(7n);
  });
});

// ---------------------------------------------------------------------------
// normalizeCallFrame log passthrough (covers normalize.ts new lines)
// ---------------------------------------------------------------------------

describe("normalizeCallFrame log passthrough", () => {
  it("returns undefined logs when raw.logs absent", () => {
    const raw: RawCallFrame = {
      type: "CALL",
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gas: "0x0",
      gasUsed: "0x0",
      input: "0x",
    };
    expect(normalizeCallFrame(raw).logs).toBeUndefined();
  });

  it("normalizes log address to lowercase and preserves topics+data", () => {
    const raw: RawCallFrame = {
      type: "CALL",
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gas: "0x0",
      gasUsed: "0x0",
      input: "0x",
      logs: [
        {
          address: addrs.CONTRACT.toUpperCase(),
          topics: ["0xAAAA", "0xBBBB"],
          data: "0xCAFE",
        },
      ],
    };
    const frame = normalizeCallFrame(raw);
    expect(frame.logs).toHaveLength(1);
    expect(frame.logs![0].address).toBe(addrs.CONTRACT);
    expect(frame.logs![0].topics).toEqual(["0xAAAA", "0xBBBB"]);
    expect(frame.logs![0].data).toBe("0xCAFE");
  });

  it("defaults missing address/topics/data on log", () => {
    const raw: RawCallFrame = {
      type: "CALL",
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gas: "0x0",
      gasUsed: "0x0",
      input: "0x",
      // @ts-expect-error — testing defensive defaults
      logs: [{}],
    };
    const frame = normalizeCallFrame(raw);
    expect(frame.logs![0].address).toBe("0x");
    expect(frame.logs![0].topics).toEqual([]);
    expect(frame.logs![0].data).toBe("0x");
  });
});

// ---------------------------------------------------------------------------
// parsePrestateDiff
// ---------------------------------------------------------------------------

describe("parsePrestateDiff", () => {
  it("returns empty array for empty diff", () => {
    expect(parsePrestateDiff({ pre: {}, post: {} })).toEqual([]);
  });

  it("computes signed delta for changed balance", () => {
    const raw: RawPrestateDiff = {
      pre: { [addrs.ALICE]: { balance: "0x64" } }, // 100
      post: { [addrs.ALICE]: { balance: "0x32" } }, // 50
    };
    const deltas = parsePrestateDiff(raw);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toEqual({
      address: addrs.ALICE,
      delta: -50n,
      preBalance: 100n,
      postBalance: 50n,
    });
  });

  it("treats missing pre as zero (new account)", () => {
    const raw: RawPrestateDiff = {
      pre: {},
      post: { [addrs.BOB]: { balance: "0xa" } }, // 10
    };
    const deltas = parsePrestateDiff(raw);
    expect(deltas[0]).toEqual({
      address: addrs.BOB,
      delta: 10n,
      preBalance: 0n,
      postBalance: 10n,
    });
  });

  it("treats post entry entirely missing as zero balance (self-destruct)", () => {
    const raw: RawPrestateDiff = {
      pre: { [addrs.VAULT]: { balance: "0x64", nonce: 1 } },
      post: {},
    };
    const deltas = parsePrestateDiff(raw);
    expect(deltas[0]).toEqual({
      address: addrs.VAULT,
      delta: -100n,
      preBalance: 100n,
      postBalance: 0n,
    });
  });

  it("treats post.balance undefined as unchanged (only other fields changed)", () => {
    const raw: RawPrestateDiff = {
      pre: { [addrs.CONTRACT]: { balance: "0x64", nonce: 5 } },
      post: { [addrs.CONTRACT]: { nonce: 6 } },
    };
    expect(parsePrestateDiff(raw)).toEqual([]);
  });

  it("filters zero-delta addresses even when present in both pre and post", () => {
    const raw: RawPrestateDiff = {
      pre: { [addrs.ALICE]: { balance: "0x64" } },
      post: { [addrs.ALICE]: { balance: "0x64" } },
    };
    expect(parsePrestateDiff(raw)).toEqual([]);
  });

  it("sorts results by address ascending for determinism", () => {
    const raw: RawPrestateDiff = {
      pre: {
        [addrs.VAULT]: { balance: "0x0" },
        [addrs.ALICE]: { balance: "0x0" },
        [addrs.CONTRACT]: { balance: "0x0" },
      },
      post: {
        [addrs.VAULT]: { balance: "0x1" },
        [addrs.ALICE]: { balance: "0x1" },
        [addrs.CONTRACT]: { balance: "0x1" },
      },
    };
    const out = parsePrestateDiff(raw).map((d) => d.address);
    expect(out).toEqual([...out].sort());
  });

  it("defaults absent pre/post envelopes to empty (no throw)", () => {
    // @ts-expect-error — exercise the ?? {} branches
    expect(parsePrestateDiff({})).toEqual([]);
  });

  it("handles malformed balance hex by treating it as zero", () => {
    const raw: RawPrestateDiff = {
      pre: { [addrs.ALICE]: { balance: "garbage" } },
      post: { [addrs.ALICE]: { balance: "0xa" } },
    };
    const deltas = parsePrestateDiff(raw);
    expect(deltas[0].preBalance).toBe(0n);
    expect(deltas[0].postBalance).toBe(10n);
  });

  it("treats explicit '0x' balance as zero", () => {
    const raw: RawPrestateDiff = {
      pre: { [addrs.ALICE]: { balance: "0x" } },
      post: { [addrs.ALICE]: { balance: "0x5" } },
    };
    expect(parsePrestateDiff(raw)[0].preBalance).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// parseApprovals
// ---------------------------------------------------------------------------

const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

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

describe("parseApprovals", () => {
  it("returns empty array when no logs", () => {
    expect(parseApprovals(makeFrame({}))).toEqual([]);
  });

  it("decodes a single ERC-20 Approval event", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [approvalLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, 1_000n)],
    };
    const approvals = parseApprovals(frame);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toEqual({
      token: addrs.CONTRACT,
      owner: addrs.ALICE,
      spender: addrs.BOB,
      value: 1_000n,
      logIndex: 0,
    });
  });

  it("filters ERC-721 Approval (4 topics) by topic count", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          address: addrs.CONTRACT,
          topics: [
            APPROVAL_TOPIC as Hex,
            addrTopic(addrs.ALICE),
            addrTopic(addrs.BOB),
            uint256Hex(42n),
          ],
          data: "0x" as Hex,
        },
      ],
    };
    expect(parseApprovals(frame)).toEqual([]);
  });

  it("ignores logs with a non-Approval topic", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          address: addrs.CONTRACT,
          topics: [
            // Transfer topic, not Approval
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex,
            addrTopic(addrs.ALICE),
            addrTopic(addrs.BOB),
          ],
          data: uint256Hex(5n),
        },
      ],
    };
    expect(parseApprovals(frame)).toEqual([]);
  });

  it("rejects malformed owner-topic length", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          address: addrs.CONTRACT,
          topics: [APPROVAL_TOPIC as Hex, "0x1234" as Hex, addrTopic(addrs.BOB)],
          data: uint256Hex(1n),
        },
      ],
    };
    expect(parseApprovals(frame)).toEqual([]);
  });

  it("rejects malformed spender-topic length", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          address: addrs.CONTRACT,
          topics: [APPROVAL_TOPIC as Hex, addrTopic(addrs.ALICE), "0x5678" as Hex],
          data: uint256Hex(1n),
        },
      ],
    };
    expect(parseApprovals(frame)).toEqual([]);
  });

  it("rejects unparseable value data", () => {
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
    expect(parseApprovals(frame)).toEqual([]);
  });

  it("skips reverted frames AND their subtree", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [approvalLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, 1n)],
      children: [
        {
          ...makeFrame({
            depth: 1,
            from: addrs.CONTRACT,
            to: addrs.VAULT,
            error: "execution reverted",
          }),
          logs: [approvalLog(addrs.VAULT, addrs.ALICE, addrs.BOB, 999n)],
          children: [
            {
              ...makeFrame({ depth: 2, from: addrs.VAULT, to: addrs.BOB }),
              logs: [approvalLog(addrs.VAULT, addrs.ALICE, addrs.BOB, 888n)],
            },
          ],
        },
        {
          ...makeFrame({ depth: 1, from: addrs.CONTRACT, to: addrs.BOB }),
          logs: [approvalLog(addrs.BOB, addrs.ALICE, addrs.CONTRACT, 3n)],
        },
      ],
    };
    const approvals = parseApprovals(frame);
    expect(approvals).toHaveLength(2);
    expect(approvals.map((a) => a.value)).toEqual([1n, 3n]);
  });

  it("increments logIndex for non-Approval logs we skip", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [
        {
          address: addrs.CONTRACT,
          topics: ["0xdeadbeef" as Hex],
          data: "0x" as Hex,
        },
        approvalLog(addrs.CONTRACT, addrs.ALICE, addrs.BOB, 5n),
      ],
    };
    const approvals = parseApprovals(frame);
    expect(approvals).toHaveLength(1);
    expect(approvals[0].logIndex).toBe(1);
  });
});
