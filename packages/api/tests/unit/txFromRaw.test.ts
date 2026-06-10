import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatTransaction, formatTransactionReceipt } from "viem";
import {
  buildTransactionDetails,
  buildPendingTransactionDetails,
} from "../../src/services/explorer/transactionDetails.js";

/**
 * The mapping half of POST /api/tx/:hash/from-raw: raw RPC tx/receipt (as the
 * BYO-RPC client fetched them from its node) → viem formatters → the SAME
 * `buildTransactionDetails` the GET route uses. We use a contract-creation tx
 * (`to: null`, no logs) so the path is pure mapping with no ABI fetch / network.
 */

const HASH = `0x${"11".repeat(32)}`;
const FROM = `0x${"aa".repeat(20)}`;
const NEW_CONTRACT = `0x${"cc".repeat(20)}`;

const RAW_TX = {
  hash: HASH,
  nonce: "0x1",
  blockHash: `0x${"22".repeat(32)}`,
  blockNumber: "0x3039", // 12345
  transactionIndex: "0x0",
  from: FROM,
  to: null,
  value: "0xde0b6b3a7640000", // 1e18 wei
  gas: "0x5208",
  gasPrice: "0x7",
  input: "0x",
  type: "0x0",
  v: "0x1b",
  r: `0x${"00".repeat(32)}`,
  s: `0x${"00".repeat(32)}`,
};

const RAW_RECEIPT = {
  transactionHash: HASH,
  transactionIndex: "0x0",
  blockHash: `0x${"22".repeat(32)}`,
  blockNumber: "0x3039",
  from: FROM,
  to: null,
  cumulativeGasUsed: "0x5208",
  gasUsed: "0x5208",
  contractAddress: NEW_CONTRACT,
  logs: [],
  logsBloom: `0x${"00".repeat(256)}`,
  status: "0x1",
  effectiveGasPrice: "0x7",
  type: "0x0",
};

describe("buildTransactionDetails — from raw RPC payloads (BYO-RPC path)", () => {
  it("maps a formatted raw tx/receipt to TransactionDetails", async () => {
    const tx = formatTransaction(RAW_TX as never);
    const receipt = formatTransactionReceipt(RAW_RECEIPT as never);
    const details = await buildTransactionDetails(tx, receipt, 1_700_000_000);

    assert.equal(details.hash, HASH);
    assert.equal(details.value, "1000000000000000000");
    assert.equal(details.valuePLS, "1");
    assert.equal(details.to, null);
    assert.equal(details.status, "success");
    assert.equal(details.blockNumber, "12345");
    assert.equal(details.gasUsed, "21000");
    assert.equal(details.contractAddress?.toLowerCase(), NEW_CONTRACT);
    assert.equal(details.timestamp, 1_700_000_000);
    // contract creation has no callee ABI → no decode work, never null-crashes
    assert.equal(details.decodedInput, null);
    assert.deepEqual(details.decodedLogs, []);
  });

  it("skips decode entirely when asked (skipDecode)", async () => {
    const tx = formatTransaction(RAW_TX as never);
    const receipt = formatTransactionReceipt(RAW_RECEIPT as never);
    const details = await buildTransactionDetails(tx, receipt, null, {
      skipDecode: true,
    });
    assert.equal(details.decodedInput, null);
    assert.equal(details.timestamp, null);
  });
});

describe("buildPendingTransactionDetails — mempool tx (no receipt)", () => {
  // A pending tx: same raw tx, but blockNumber/transactionIndex are null and
  // there is no receipt at all.
  const PENDING_RAW_TX = {
    ...RAW_TX,
    blockHash: null,
    blockNumber: null,
    transactionIndex: null,
  };

  it("maps tx-only fields and zeroes everything receipt-derived", async () => {
    const tx = formatTransaction(PENDING_RAW_TX as never);
    const details = await buildPendingTransactionDetails(tx);

    // tx facts survive
    assert.equal(details.hash, HASH);
    assert.equal(details.value, "1000000000000000000");
    assert.equal(details.valuePLS, "1");
    assert.equal(details.gas, "21000");
    assert.equal(details.nonce, 1);

    // pending markers
    assert.equal(details.status, "pending");
    assert.equal(details.blockNumber, "pending");
    assert.equal(details.blockHash, "");
    assert.equal(details.timestamp, null);

    // nothing receipt-derived exists yet
    assert.equal(details.gasUsed, "0");
    assert.equal(details.effectiveGasPrice, "0");
    assert.equal(details.cumulativeGasUsed, "0");
    assert.equal(details.contractAddress, null);
    assert.deepEqual(details.decodedLogs, []);
    assert.deepEqual(details.rawLogs, []);
    // value transfer (input 0x) → no calldata to decode, no ABI fetch
    assert.equal(details.decodedInput, null);
  });
});
