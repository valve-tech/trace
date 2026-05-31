import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Address, Hex } from "viem";
import { filterBySelector } from "../src/traversal/filterBySelector.js";
import { parseTokenDeltas } from "../src/parsers/tokenDeltas.js";
import { parseApprovals } from "../src/parsers/approvals.js";
import { walkCallTree } from "../src/traversal/walkCallTree.js";
import type { Log, TraceFrame } from "../src/types.js";

/**
 * Property-based tests for the three parser surfaces most likely to harbor
 * edge-case bugs:
 *
 *   1. filterBySelector  — selector matching across arbitrary trace shapes
 *   2. parseTokenDeltas  — ERC-20 Transfer extraction + reverted-subtree skip
 *   3. parseApprovals    — ERC-20 Approval extraction + reverted-subtree skip
 *
 * The SDK already hits 100/100/100/100 *line* coverage. Property tests do
 * something line coverage can't: they generate large slices of the input
 * space and assert structural invariants over every generated instance.
 * Line coverage tells you "every line was executed at least once";
 * property tests tell you "every generated input satisfies the
 * invariant," which is the stronger property when the input domain is
 * combinatorial (e.g. a tree shape × tens of fields per frame).
 *
 * 200 generated instances per property by default. Bumped for the cheap
 * ones, kept small for tree-generating ones since trees can grow fast.
 */

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925" as Hex;

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** 20-byte hex address, lowercase. */
const arbAddress = fc
  .uint8Array({ minLength: 20, maxLength: 20 })
  .map((bytes) => {
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return (`0x${hex}`) as Address;
  });

/** 4-byte function selector. */
const arbSelector = fc
  .uint8Array({ minLength: 4, maxLength: 4 })
  .map((bytes) => {
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return (`0x${hex}`) as Hex;
  });

/** Calldata: selector + 0–8 32-byte words of args. */
const arbCalldata = fc
  .tuple(
    arbSelector,
    fc.array(fc.uint8Array({ minLength: 32, maxLength: 32 }), {
      minLength: 0,
      maxLength: 8,
    }),
  )
  .map(([sel, words]) => {
    const argHex = words
      .map((w) =>
        Array.from(w, (b) => b.toString(16).padStart(2, "0")).join(""),
      )
      .join("");
    return (`${sel}${argHex}`) as Hex;
  });

/** Topic encoding of an address: zero-pad to 32 bytes. */
function addressTopic(addr: Address): Hex {
  return (`0x000000000000000000000000${addr.slice(2)}`) as Hex;
}

/** 32-byte uint256 encoded as hex. */
function uint256Hex(n: bigint): Hex {
  return (`0x${n.toString(16).padStart(64, "0")}`) as Hex;
}

const arbUint256 = fc
  .bigInt({ min: 0n, max: 2n ** 256n - 1n })
  .map((n) => ({ n, hex: uint256Hex(n) }));

/** Well-formed ERC-20 Transfer log. */
const arbTransferLog = fc
  .tuple(arbAddress, arbAddress, arbAddress, arbUint256)
  .map(
    ([token, from, to, { hex: dataHex }]): Log => ({
      address: token,
      topics: [TRANSFER_TOPIC, addressTopic(from), addressTopic(to)],
      data: dataHex,
    }),
  );

/** Well-formed ERC-20 Approval log. */
const arbApprovalLog = fc
  .tuple(arbAddress, arbAddress, arbAddress, arbUint256)
  .map(
    ([token, owner, spender, { hex: dataHex }]): Log => ({
      address: token,
      topics: [APPROVAL_TOPIC, addressTopic(owner), addressTopic(spender)],
      data: dataHex,
    }),
  );

/** Hex string of N bytes, lowercase, no 0x prefix. */
const arbHexBytes = (maxBytes: number) =>
  fc
    .uint8Array({ minLength: 0, maxLength: maxBytes })
    .map((b) =>
      Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""),
    );

/** Random log — may or may not be a Transfer/Approval. */
const arbRandomLog = fc
  .tuple(
    arbAddress,
    fc.array(
      fc
        .uint8Array({ minLength: 32, maxLength: 32 })
        .map((b) =>
          (`0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(
            "",
          )}`) as Hex,
        ),
      { minLength: 1, maxLength: 4 },
    ),
    arbHexBytes(64).map((s) => (`0x${s}`) as Hex),
  )
  .map(([addr, topics, data]): Log => ({ address: addr, topics, data }));

/**
 * Trace tree with explicit depth bound. `fc.letrec` was producing
 * occasional unbounded-depth instances even with `maxLength: 2` on the
 * children array — fast-check's letrec doesn't strictly bias toward
 * shallower trees, so an unlucky seed could blow the call stack. Bounding
 * depth manually gives a hard ceiling.
 */
function arbTraceFrame(depth: number = 4): fc.Arbitrary<TraceFrame> {
  const childrenArb: fc.Arbitrary<TraceFrame[]> =
    depth <= 0
      ? fc.constant<TraceFrame[]>([])
      : fc.array(arbTraceFrame(depth - 1), { minLength: 0, maxLength: 2 });

  return fc
    .tuple(
      arbAddress, // from
      fc.option(arbAddress, { nil: null }), // to (null for CREATE)
      arbCalldata, // input
      fc.array(fc.oneof(arbTransferLog, arbApprovalLog, arbRandomLog), {
        minLength: 0,
        maxLength: 3,
      }),
      fc.option(fc.constant("execution reverted"), { nil: undefined }), // error
      childrenArb,
    )
    .map(
      ([from, to, input, logs, error, children]): TraceFrame => ({
        type: "CALL",
        from,
        to,
        value: 0n,
        gas: 100_000n,
        gasUsed: 1000n,
        input,
        output: "0x" as Hex,
        error: error ?? undefined,
        depth: 0,
        children,
        logs,
      }),
    );
}

// ---------------------------------------------------------------------------
// filterBySelector
// ---------------------------------------------------------------------------

describe("filterBySelector — properties", () => {
  it("every returned frame's input starts with the normalized selector", () => {
    fc.assert(
      fc.property(arbTraceFrame(), arbSelector, (root, selector) => {
        const matches = filterBySelector(root, selector);
        const expectedPrefix = selector.toLowerCase();
        for (const frame of matches) {
          expect(frame.input.toLowerCase().startsWith(expectedPrefix)).toBe(
            true,
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  it("returned frames are a subset of the frames in the tree", () => {
    fc.assert(
      fc.property(arbTraceFrame(), arbSelector, (root, selector) => {
        const all: TraceFrame[] = [];
        walkCallTree(root, { enter: (f) => void all.push(f) });
        const matches = filterBySelector(root, selector);
        for (const m of matches) {
          expect(all.includes(m)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("is idempotent — calling twice on the same input gives the same output", () => {
    fc.assert(
      fc.property(arbTraceFrame(), arbSelector, (root, selector) => {
        const a = filterBySelector(root, selector);
        const b = filterBySelector(root, selector);
        expect(a).toEqual(b);
      }),
      { numRuns: 100 },
    );
  });

  it("accepts selector with or without 0x prefix equivalently", () => {
    fc.assert(
      fc.property(arbTraceFrame(), arbSelector, (root, selector) => {
        const withPrefix = filterBySelector(root, selector);
        const withoutPrefix = filterBySelector(root, selector.slice(2));
        expect(withPrefix).toEqual(withoutPrefix);
      }),
      { numRuns: 100 },
    );
  });

  it("throws for any non-4-byte selector", () => {
    fc.assert(
      fc.property(
        arbTraceFrame(),
        arbHexBytes(10).filter((s) => {
          // Reject strings that would normalize to exactly 10 chars
          // (4 bytes + 0x). Anything shorter or longer must throw.
          const normalized = s.startsWith("0x") ? s : `0x${s}`;
          return normalized.length !== 10;
        }),
        (root, badSelector) => {
          expect(() => filterBySelector(root, badSelector)).toThrow();
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// parseTokenDeltas
// ---------------------------------------------------------------------------

describe("parseTokenDeltas — properties", () => {
  it("every returned delta corresponds to a Transfer log somewhere in the tree", () => {
    fc.assert(
      fc.property(arbTraceFrame(), (root) => {
        const deltas = parseTokenDeltas(root);
        // Collect every Transfer-topic log in the tree (including reverted —
        // we verify reverted-skip separately below).
        const transferLogs: { token: string; logHex: string }[] = [];
        walkCallTree(root, {
          enter: (frame) => {
            if (!frame.logs) return;
            for (const log of frame.logs) {
              if (
                log.topics.length === 3 &&
                log.topics[0] === TRANSFER_TOPIC
              ) {
                transferLogs.push({
                  token: log.address.toLowerCase(),
                  logHex: log.data,
                });
              }
            }
          },
        });

        // Every delta's token must exist in some Transfer log.
        for (const delta of deltas) {
          expect(
            transferLogs.some(
              (l) => l.token === delta.token.toLowerCase(),
            ),
          ).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("reverted frames contribute zero deltas (whole subtree skipped)", () => {
    fc.assert(
      fc.property(arbTraceFrame(), (root) => {
        // Force-revert the root → no deltas at all.
        const revertedRoot: TraceFrame = {
          ...root,
          error: "execution reverted",
        };
        const deltas = parseTokenDeltas(revertedRoot);
        expect(deltas).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("logIndex values are strictly increasing in walk order", () => {
    fc.assert(
      fc.property(arbTraceFrame(), (root) => {
        const deltas = parseTokenDeltas(root);
        for (let i = 1; i < deltas.length; i += 1) {
          expect(deltas[i]!.logIndex).toBeGreaterThan(deltas[i - 1]!.logIndex);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("from and to addresses are 20-byte hex (recovered from indexed topics)", () => {
    fc.assert(
      fc.property(arbTraceFrame(), (root) => {
        const deltas = parseTokenDeltas(root);
        for (const d of deltas) {
          expect(d.from).toMatch(/^0x[0-9a-f]{40}$/);
          expect(d.to).toMatch(/^0x[0-9a-f]{40}$/);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// parseApprovals
// ---------------------------------------------------------------------------

describe("parseApprovals — properties", () => {
  it("every returned approval corresponds to an Approval log somewhere in the tree", () => {
    fc.assert(
      fc.property(arbTraceFrame(), (root) => {
        const approvals = parseApprovals(root);
        const approvalLogs: string[] = [];
        walkCallTree(root, {
          enter: (frame) => {
            if (!frame.logs) return;
            for (const log of frame.logs) {
              if (
                log.topics.length === 3 &&
                log.topics[0] === APPROVAL_TOPIC
              ) {
                approvalLogs.push(log.address.toLowerCase());
              }
            }
          },
        });

        for (const ap of approvals) {
          expect(approvalLogs.includes(ap.token.toLowerCase())).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("reverted root → no approvals", () => {
    fc.assert(
      fc.property(arbTraceFrame(), (root) => {
        const revertedRoot: TraceFrame = {
          ...root,
          error: "execution reverted",
        };
        expect(parseApprovals(revertedRoot)).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("owner and spender are 20-byte hex", () => {
    fc.assert(
      fc.property(arbTraceFrame(), (root) => {
        const approvals = parseApprovals(root);
        for (const ap of approvals) {
          expect(ap.owner).toMatch(/^0x[0-9a-f]{40}$/);
          expect(ap.spender).toMatch(/^0x[0-9a-f]{40}$/);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("logIndex values are strictly increasing", () => {
    fc.assert(
      fc.property(arbTraceFrame(), (root) => {
        const approvals = parseApprovals(root);
        for (let i = 1; i < approvals.length; i += 1) {
          expect(approvals[i]!.logIndex).toBeGreaterThan(
            approvals[i - 1]!.logIndex,
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});
