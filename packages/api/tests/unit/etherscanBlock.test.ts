/**
 * Unit tests for packages/api/src/routes/etherscan/handlers/block.ts
 *
 * Three actions are tested:
 *   getblockreward     — validates blockno, returns author/timestamp/blockReward="0"
 *   getblockcountdown  — validates blockno, compares to chain head, computes ETA
 *   getblocknobytime   — validates timestamp/closest params, always returns "Not supported"
 *
 * publicClient high-level methods (getBlock, getBlockNumber) are stubbed
 * directly on the client object to avoid the viem hex-formatting layer
 * that sits between publicClient.request and the high-level action API.
 * Originals are restored in afterEach.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { publicClient } from "../../src/services/rpc.js";
import { getRpcClient } from "../../src/services/chains/clients.js";
import { DEFAULT_CHAIN_ID } from "../../src/services/chains/registry.js";
import {
  getBlockRewardAction,
  getBlockCountdownAction,
  getBlockNoByTimeAction,
} from "../../src/routes/etherscan/handlers/block.js";

// ---------------------------------------------------------------------------
// High-level method stubs
// ---------------------------------------------------------------------------

type AnyFn = (...args: unknown[]) => unknown;

interface Restorable {
  restore: () => void;
}

/**
 * `getblockreward` still reads through `getBlockDetails`, which is bound to
 * the legacy rpc.js `publicClient` singleton — stub there.
 */
function patchMethod(key: string, impl: AnyFn): Restorable {
  const client = publicClient as unknown as Record<string, AnyFn>;
  const original = client[key];
  client[key] = impl;
  return {
    restore: () => {
      client[key] = original;
    },
  };
}

/**
 * `getblockcountdown` resolves its client via `getRpcClient(chainId)`. With
 * no chain passed it falls back to the registry default (PulseChain 369), so
 * stub that client's high-level methods.
 */
function patchChainMethod(key: string, impl: AnyFn): Restorable {
  const client = getRpcClient(DEFAULT_CHAIN_ID) as unknown as Record<
    string,
    AnyFn
  >;
  const original = client[key];
  client[key] = impl;
  return {
    restore: () => {
      client[key] = original;
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BLOCK_NUMBER = "20000000";
const BLOCK_NUMBER_BIG = BigInt(BLOCK_NUMBER);

/**
 * Minimal viem getBlock result shape (already decoded — numbers are BigInt).
 * `includeTransactions: true` path returns full transaction objects; we use
 * an empty array since getBlockDetails only accesses block-level fields for
 * the reward action.
 */
function makeBlockResult(overrides: Record<string, unknown> = {}) {
  return {
    number: BLOCK_NUMBER_BIG,
    hash: "0xblockhash000000000000000000000000000000000000000000000000000000",
    parentHash:
      "0xparenthash00000000000000000000000000000000000000000000000000000",
    timestamp: BigInt(1_700_000_000),
    miner: "0x0000000000000000000000000000000000000099",
    gasUsed: BigInt(21_000),
    gasLimit: BigInt(30_000_000),
    baseFeePerGas: null,
    size: BigInt(500),
    transactions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getblockreward — input validation
// ---------------------------------------------------------------------------

const INVALID_BLOCKNOS = [
  "",
  "not-a-number",
  "-1",
  "0x1a", // hex — only decimal digits pass BLOCKNO_RE
];

describe("etherscan block.getblockreward — input validation", () => {
  for (const bad of INVALID_BLOCKNOS) {
    it(`rejects blockno=${JSON.stringify(bad)}`, async () => {
      const res = await getBlockRewardAction({ blockno: bad });
      assert.equal(res.status, "0");
      assert.equal(res.result, "Invalid block number");
    });
  }

  it("rejects a missing blockno param", async () => {
    const res = await getBlockRewardAction({});
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid block number");
  });
});

// ---------------------------------------------------------------------------
// getblockreward — happy path
// ---------------------------------------------------------------------------

describe("etherscan block.getblockreward — happy path", () => {
  let patch: Restorable | null = null;

  afterEach(() => {
    patch?.restore();
    patch = null;
  });

  it("returns blockNumber, timeStamp, blockMiner, blockReward='0', uncles=[]", async () => {
    patch = patchMethod("getBlock", () => Promise.resolve(makeBlockResult()));
    const res = await getBlockRewardAction({ blockno: BLOCK_NUMBER });
    assert.equal(res.status, "1");
    if (res.status === "1") {
      assert.equal(res.result.blockNumber, BLOCK_NUMBER);
      assert.equal(res.result.timeStamp, "1700000000");
      assert.equal(
        res.result.blockMiner,
        "0x0000000000000000000000000000000000000099",
      );
      assert.equal(res.result.blockReward, "0");
      assert.deepEqual(res.result.uncles, []);
      assert.equal(res.result.uncleInclusionReward, "0");
    }
  });

  it("upstream throw → etherscanErr 'Upstream temporarily unavailable'", async () => {
    patch = patchMethod("getBlock", () =>
      Promise.reject(new Error("RPC timeout")),
    );
    const res = await getBlockRewardAction({ blockno: BLOCK_NUMBER });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Upstream temporarily unavailable");
  });
});

// ---------------------------------------------------------------------------
// getblockcountdown — input validation
// ---------------------------------------------------------------------------

describe("etherscan block.getblockcountdown — input validation", () => {
  for (const bad of INVALID_BLOCKNOS) {
    it(`rejects blockno=${JSON.stringify(bad)}`, async () => {
      const res = await getBlockCountdownAction({ blockno: bad });
      assert.equal(res.status, "0");
      assert.equal(res.result, "Invalid block number");
    });
  }

  it("rejects a missing blockno param", async () => {
    const res = await getBlockCountdownAction({});
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid block number");
  });
});

// ---------------------------------------------------------------------------
// getblockcountdown — happy path and edge cases
// ---------------------------------------------------------------------------

describe("etherscan block.getblockcountdown — happy path", () => {
  let patch: Restorable | null = null;

  afterEach(() => {
    patch?.restore();
    patch = null;
  });

  it("target > head → returns countdown fields and correct ETA (10s per block)", async () => {
    // head = 20_000_000, target = 20_000_100 → remaining = 100, eta = 1000s
    const HEAD = BigInt(20_000_000);
    const TARGET = "20000100";

    patch = patchChainMethod("getBlockNumber", () => Promise.resolve(HEAD));

    const res = await getBlockCountdownAction({ blockno: TARGET });
    assert.equal(res.status, "1");
    if (res.status === "1") {
      assert.equal(res.result.CurrentBlock, HEAD.toString());
      assert.equal(res.result.CountdownBlock, TARGET);
      assert.equal(res.result.RemainingBlock, "100");
      assert.equal(res.result.EstimateTimeInSec, "1000");
    }
  });

  it("target === head → returns etherscanErr 'Block number already pass'", async () => {
    const HEAD = BigInt(20_000_000);
    patch = patchChainMethod("getBlockNumber", () => Promise.resolve(HEAD));

    const res = await getBlockCountdownAction({ blockno: HEAD.toString() });
    assert.equal(res.status, "0");
    assert.match(res.result, /Block number already pass/);
  });

  it("target < head → returns etherscanErr 'Block number already pass'", async () => {
    const HEAD = BigInt(20_000_100);
    patch = patchChainMethod("getBlockNumber", () => Promise.resolve(HEAD));

    const res = await getBlockCountdownAction({ blockno: "20000000" });
    assert.equal(res.status, "0");
    assert.match(res.result, /Block number already pass/);
  });

  it("remaining=1 → EstimateTimeInSec='10'", async () => {
    const HEAD = BigInt(999);
    patch = patchChainMethod("getBlockNumber", () => Promise.resolve(HEAD));

    const res = await getBlockCountdownAction({ blockno: "1000" });
    assert.equal(res.status, "1");
    if (res.status === "1") {
      assert.equal(res.result.RemainingBlock, "1");
      assert.equal(res.result.EstimateTimeInSec, "10");
    }
  });

  it("getBlockNumber throw → etherscanErr 'Upstream temporarily unavailable'", async () => {
    patch = patchChainMethod("getBlockNumber", () =>
      Promise.reject(new Error("RPC down")),
    );
    const res = await getBlockCountdownAction({ blockno: "99999999" });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Upstream temporarily unavailable");
  });
});

// ---------------------------------------------------------------------------
// getblocknobytime — input validation + not-supported
// ---------------------------------------------------------------------------

describe("etherscan block.getblocknobytime — input validation", () => {
  it("rejects missing timestamp param", async () => {
    const res = await getBlockNoByTimeAction({});
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid timestamp");
  });

  it("rejects non-numeric timestamp", async () => {
    const res = await getBlockNoByTimeAction({ timestamp: "not-a-number" });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid timestamp");
  });

  it("rejects negative timestamp string", async () => {
    const res = await getBlockNoByTimeAction({ timestamp: "-1" });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid timestamp");
  });

  it("rejects invalid closest value", async () => {
    const res = await getBlockNoByTimeAction({
      timestamp: "1700000000",
      closest: "middle",
    });
    assert.equal(res.status, "0");
    assert.match(res.result, /Invalid closest/);
  });
});

describe("etherscan block.getblocknobytime — not-supported response", () => {
  it("returns 'Not supported' for valid timestamp + closest='before'", async () => {
    const res = await getBlockNoByTimeAction({
      timestamp: "1700000000",
      closest: "before",
    });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Not supported");
  });

  it("returns 'Not supported' for valid timestamp + closest='after'", async () => {
    const res = await getBlockNoByTimeAction({
      timestamp: "1700000000",
      closest: "after",
    });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Not supported");
  });

  it("defaults closest to 'before' when omitted → returns 'Not supported'", async () => {
    const res = await getBlockNoByTimeAction({ timestamp: "1700000000" });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Not supported");
  });
});
