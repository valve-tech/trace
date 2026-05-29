/**
 * Unit tests for packages/api/src/routes/etherscan/handlers/transaction.ts
 *
 * Both actions (getstatus, gettxreceiptstatus) are tested for:
 *   - invalid / missing hash → etherscanErr
 *   - found success tx → etherscanOk with correct shape
 *   - found reverted tx → etherscanOk with correct status flag
 *   - upstream throws → handler catches and returns etherscanErr
 *
 * publicClient high-level methods (getTransaction, getTransactionReceipt,
 * getBlock) are stubbed directly on the client object to avoid the viem
 * hex-formatting layer that sits between publicClient.request and the
 * high-level action API. Originals are restored in afterEach.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { publicClient } from "../../src/services/rpc.js";
import {
  getStatusAction,
  getTxReceiptStatusAction,
} from "../../src/routes/etherscan/handlers/transaction.js";

// ---------------------------------------------------------------------------
// High-level method stubs for publicClient
// ---------------------------------------------------------------------------

type AnyFn = (...args: unknown[]) => unknown;

interface Restorable {
  restore: () => void;
}

function patchMethod(
  key: string,
  impl: AnyFn,
): Restorable {
  const client = publicClient as unknown as Record<string, AnyFn>;
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

const VALID_HASH =
  "0xabc1230000000000000000000000000000000000000000000000000000000000";

/**
 * Minimal viem getTransaction result shape (already decoded by viem).
 */
function makeTxResult(overrides: Record<string, unknown> = {}) {
  return {
    hash: VALID_HASH,
    blockNumber: BigInt(20_000_000),
    blockHash:
      "0xblockhash000000000000000000000000000000000000000000000000000000",
    transactionIndex: 0,
    from: "0x0000000000000000000000000000000000000001",
    to: "0x0000000000000000000000000000000000000002",
    value: BigInt(0),
    gas: BigInt(21_000),
    gasPrice: BigInt(1_000_000_000),
    nonce: 1,
    input: "0x",
    type: "legacy",
    ...overrides,
  };
}

/**
 * Minimal viem getTransactionReceipt result shape.
 */
function makeReceiptResult(
  status: "success" | "reverted" = "success",
  overrides: Record<string, unknown> = {},
) {
  return {
    transactionHash: VALID_HASH,
    blockNumber: BigInt(20_000_000),
    status,
    gasUsed: BigInt(21_000),
    effectiveGasPrice: BigInt(1_000_000_000),
    cumulativeGasUsed: BigInt(21_000),
    contractAddress: null,
    logs: [],
    ...overrides,
  };
}

/**
 * Minimal viem getBlock result shape (only the timestamp field is needed
 * for the transaction handler's best-effort timestamp lookup).
 */
function makeBlockResult() {
  return {
    number: BigInt(20_000_000),
    hash: "0xblockhash000000000000000000000000000000000000000000000000000000",
    timestamp: BigInt(1_700_000_000),
    transactions: [],
  };
}

/**
 * Patch all three methods getTransactionDetails needs. Returns a single
 * composite restore handle.
 */
function patchTxMethods(receiptStatus: "success" | "reverted" = "success") {
  const getTx = patchMethod("getTransaction", () =>
    Promise.resolve(makeTxResult()),
  );
  const getReceipt = patchMethod("getTransactionReceipt", () =>
    Promise.resolve(makeReceiptResult(receiptStatus)),
  );
  const getBlock = patchMethod("getBlock", () =>
    Promise.resolve(makeBlockResult()),
  );
  return {
    restore: () => {
      getTx.restore();
      getReceipt.restore();
      getBlock.restore();
    },
  };
}

/**
 * Patch all three methods to throw, simulating an upstream RPC failure.
 */
function patchTxMethodsThrow() {
  const err = () => Promise.reject(new Error("RPC timeout"));
  const getTx = patchMethod("getTransaction", err);
  const getReceipt = patchMethod("getTransactionReceipt", err);
  const getBlock = patchMethod("getBlock", err);
  return {
    restore: () => {
      getTx.restore();
      getReceipt.restore();
      getBlock.restore();
    },
  };
}

// ---------------------------------------------------------------------------
// getstatus — input validation
// ---------------------------------------------------------------------------

const INVALID_HASHES = [
  "",
  "not-a-hash",
  "0x123", // too short
  "0xGGGG0000000000000000000000000000000000000000000000000000000000000", // non-hex
  "abc1230000000000000000000000000000000000000000000000000000000000", // missing 0x
];

describe("etherscan transaction.getstatus — input validation", () => {
  for (const bad of INVALID_HASHES) {
    it(`rejects ${JSON.stringify(bad)}`, async () => {
      const res = await getStatusAction({ txhash: bad });
      assert.equal(res.status, "0");
      assert.equal(res.result, "Invalid transaction hash");
    });
  }

  it("rejects a missing txhash param", async () => {
    const res = await getStatusAction({});
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid transaction hash");
  });
});

// ---------------------------------------------------------------------------
// getstatus — happy paths
// ---------------------------------------------------------------------------

describe("etherscan transaction.getstatus — happy path", () => {
  let patch: Restorable | null = null;

  afterEach(() => {
    patch?.restore();
    patch = null;
  });

  it("success tx → isError='0' and errDescription=''", async () => {
    patch = patchTxMethods("success");
    const res = await getStatusAction({ txhash: VALID_HASH });
    assert.equal(res.status, "1");
    if (res.status === "1") {
      assert.equal(res.result.isError, "0");
      assert.equal(res.result.errDescription, "");
    }
  });

  it("reverted tx → isError='1' and errDescription=''", async () => {
    patch = patchTxMethods("reverted");
    const res = await getStatusAction({ txhash: VALID_HASH });
    assert.equal(res.status, "1");
    if (res.status === "1") {
      assert.equal(res.result.isError, "1");
      assert.equal(res.result.errDescription, "");
    }
  });

  it("upstream throw → etherscanErr 'Upstream temporarily unavailable'", async () => {
    patch = patchTxMethodsThrow();
    const res = await getStatusAction({ txhash: VALID_HASH });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Upstream temporarily unavailable");
  });
});

// ---------------------------------------------------------------------------
// gettxreceiptstatus — input validation
// ---------------------------------------------------------------------------

describe("etherscan transaction.gettxreceiptstatus — input validation", () => {
  for (const bad of INVALID_HASHES) {
    it(`rejects ${JSON.stringify(bad)}`, async () => {
      const res = await getTxReceiptStatusAction({ txhash: bad });
      assert.equal(res.status, "0");
      assert.equal(res.result, "Invalid transaction hash");
    });
  }

  it("rejects a missing txhash param", async () => {
    const res = await getTxReceiptStatusAction({});
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid transaction hash");
  });
});

// ---------------------------------------------------------------------------
// gettxreceiptstatus — happy paths
// ---------------------------------------------------------------------------

describe("etherscan transaction.gettxreceiptstatus — happy path", () => {
  let patch: Restorable | null = null;

  afterEach(() => {
    patch?.restore();
    patch = null;
  });

  it("success tx → status='1'", async () => {
    patch = patchTxMethods("success");
    const res = await getTxReceiptStatusAction({ txhash: VALID_HASH });
    assert.equal(res.status, "1");
    if (res.status === "1") {
      assert.equal(res.result.status, "1");
    }
  });

  it("reverted tx → status='0'", async () => {
    patch = patchTxMethods("reverted");
    const res = await getTxReceiptStatusAction({ txhash: VALID_HASH });
    assert.equal(res.status, "1");
    if (res.status === "1") {
      assert.equal(res.result.status, "0");
    }
  });

  it("upstream throw → etherscanErr 'Upstream temporarily unavailable'", async () => {
    patch = patchTxMethodsThrow();
    const res = await getTxReceiptStatusAction({ txhash: VALID_HASH });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Upstream temporarily unavailable");
  });
});
