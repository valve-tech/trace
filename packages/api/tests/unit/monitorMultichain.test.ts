/**
 * Unit tests for the multichain monitor pieces:
 *
 *   - lifecycle.ts catchUpRange / makeWatcher (pure watcher math)
 *   - matchers.ts client injection — matchBalanceThreshold + matchFailedTx
 *     hit the INJECTED per-chain client (not a 369 singleton) and the
 *     balance summary names the watched chain's native symbol
 *
 * No live RPC: the stateful matchers receive a stubbed viem client.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PublicClient } from "viem";

import {
  catchUpRange,
  makeWatcher,
} from "../../src/services/monitor/lifecycle.js";
import {
  matchBalanceThreshold,
  matchFailedTx,
} from "../../src/services/monitor/matchers.js";

const ADDR = "0x1111111111111111111111111111111111111111";
const TX = `0x${"ab".repeat(32)}`;

describe("monitor lifecycle — watcher math", () => {
  it("makeWatcher starts uninitialized (head = 0n, not processing)", () => {
    const w = makeWatcher(943);
    assert.equal(w.chainId, 943);
    assert.equal(w.lastProcessedBlock, 0n);
    assert.equal(w.isProcessing, false);
  });

  it("catchUpRange walks one block when the head advanced by one", () => {
    assert.deepEqual(catchUpRange(100n, 101n), [101n, 101n]);
  });

  it("catchUpRange covers the full gap when within the cap", () => {
    assert.deepEqual(catchUpRange(100n, 105n), [101n, 105n]);
  });

  it("catchUpRange caps a deep backlog at 5 blocks past the start", () => {
    const [start, end] = catchUpRange(100n, 1_000n);
    assert.equal(start, 101n);
    assert.equal(end, 106n);
  });
});

describe("monitor matchers — per-chain client injection", () => {
  it("matchBalanceThreshold reads the injected client and names the chain's symbol", async () => {
    let calledWith: unknown;
    const client = {
      getBalance: async (args: unknown) => {
        calledWith = args;
        return 5n * 10n ** 18n; // 5 native units
      },
    } as unknown as PublicClient;

    const match = await matchBalanceThreshold(
      { address: ADDR, threshold: "1", direction: "above" },
      123n,
      client,
      1, // Ethereum — summary must say ETH, not PLS
    );

    assert.ok(match, "expected a match above the threshold");
    assert.equal(match.type, "balance_threshold");
    assert.deepEqual(calledWith, { address: ADDR, blockNumber: 123n });
    assert.match(String(match.summary), /ETH/);
    assert.doesNotMatch(String(match.summary), /PLS/);
  });

  it("matchBalanceThreshold returns null when not triggered", async () => {
    const client = {
      getBalance: async () => 1n, // ~0 native
    } as unknown as PublicClient;

    const match = await matchBalanceThreshold(
      { address: ADDR, threshold: "1", direction: "above" },
      123n,
      client,
      369,
    );
    assert.equal(match, null);
  });

  it("matchBalanceThreshold swallows client errors as null (no throw)", async () => {
    const client = {
      getBalance: async () => {
        throw new Error("rpc down");
      },
    } as unknown as PublicClient;

    const match = await matchBalanceThreshold(
      { address: ADDR, threshold: "1", direction: "below" },
      123n,
      client,
      943,
    );
    assert.equal(match, null);
  });

  it("matchFailedTx fetches receipts from the injected client", async () => {
    const requested: string[] = [];
    const client = {
      getTransactionReceipt: async ({ hash }: { hash: string }) => {
        requested.push(hash);
        return { status: "reverted" };
      },
    } as unknown as PublicClient;

    const match = await matchFailedTx(
      { address: ADDR },
      [{ hash: TX, from: ADDR, to: null, value: 0n, input: "0x" }],
      99n,
      client,
    );

    assert.ok(match, "expected a failed-tx match");
    assert.equal(match.txHash, TX);
    assert.deepEqual(requested, [TX]);
  });

  it("matchFailedTx returns null when all related txs succeeded", async () => {
    const client = {
      getTransactionReceipt: async () => ({ status: "success" }),
    } as unknown as PublicClient;

    const match = await matchFailedTx(
      { address: ADDR },
      [{ hash: TX, from: ADDR, to: null, value: 0n, input: "0x" }],
      99n,
      client,
    );
    assert.equal(match, null);
  });
});
