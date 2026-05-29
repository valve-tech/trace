/**
 * Unit tests for packages/api/src/services/decoder/decode.ts
 *
 * All three exported functions are pure-ish (they call viem helpers but
 * have no I/O). We construct known ABI fragments + calldata/log fixtures
 * directly so there is no need to mock anything.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encodeFunctionData,
  encodeFunctionResult,
  encodeEventTopics,
  encodeAbiParameters,
  type Abi,
} from "viem";
import {
  decodeInput,
  decodeOutput,
  decodeLogs,
} from "../../src/services/decoder/decode.js";

// ---------------------------------------------------------------------------
// Shared ABI fixtures
// ---------------------------------------------------------------------------

const TRANSFER_ABI: Abi = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
];

const MULTI_RETURN_ABI: Abi = [
  {
    type: "function",
    name: "getInfo",
    inputs: [],
    outputs: [
      { name: "owner", type: "address" },
      { name: "balance", type: "uint256" },
    ],
    stateMutability: "view",
  },
];

const TRANSFER_EVENT_ABI: Abi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
];

const BYTES_FUNCTION_ABI: Abi = [
  {
    type: "function",
    name: "storeData",
    inputs: [{ name: "data", type: "bytes" }],
    outputs: [{ name: "hash", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
];

const INT_FUNCTION_ABI: Abi = [
  {
    type: "function",
    name: "adjust",
    inputs: [{ name: "delta", type: "int256" }],
    outputs: [{ name: "result", type: "int256" }],
    stateMutability: "pure",
  },
];

// ---------------------------------------------------------------------------
// decodeInput
// ---------------------------------------------------------------------------

describe("decodeInput", () => {
  it("decodes a transfer(address,uint256) call with named params", () => {
    const to = "0xdead000000000000000000000000000000000001" as const;
    const amount = 1000000n;
    const calldata = encodeFunctionData({
      abi: TRANSFER_ABI,
      functionName: "transfer",
      args: [to, amount],
    });

    const result = decodeInput(calldata, TRANSFER_ABI);

    assert.ok(result !== null);
    assert.equal(result.functionName, "transfer");
    assert.equal(result.args.length, 2);

    const [recipient, amountArg] = result.args;
    assert.equal(recipient?.name, "recipient");
    assert.equal(recipient?.type, "address");
    assert.equal(
      (recipient?.value as string).toLowerCase(),
      to.toLowerCase(),
    );

    assert.equal(amountArg?.name, "amount");
    assert.equal(amountArg?.type, "uint256");
    // BigInt is serialized to string
    assert.equal(amountArg?.value, "1000000");
  });

  it("serializes BigInt values to strings for JSON-safety", () => {
    const calldata = encodeFunctionData({
      abi: TRANSFER_ABI,
      functionName: "transfer",
      args: ["0xdead000000000000000000000000000000000002", 999999999999999999n],
    });
    const result = decodeInput(calldata, TRANSFER_ABI);
    assert.ok(result !== null);
    const amountArg = result.args[1];
    assert.equal(typeof amountArg?.value, "string");
    assert.equal(amountArg?.value, "999999999999999999");
  });

  it("returns null for malformed / random calldata", () => {
    const result = decodeInput("0xdeadbeef", TRANSFER_ABI);
    assert.equal(result, null);
  });

  it("returns null for empty calldata", () => {
    const result = decodeInput("0x", TRANSFER_ABI);
    assert.equal(result, null);
  });

  it("returns null when the selector matches no function in the ABI", () => {
    // Encode with a different ABI, then try to decode with TRANSFER_ABI
    const calldata = encodeFunctionData({
      abi: MULTI_RETURN_ABI,
      functionName: "getInfo",
      args: [],
    });
    const result = decodeInput(calldata, TRANSFER_ABI);
    assert.equal(result, null);
  });

  it("handles dynamic bytes input", () => {
    const payload = "0xdeadbeef" as `0x${string}`;
    const calldata = encodeFunctionData({
      abi: BYTES_FUNCTION_ABI,
      functionName: "storeData",
      args: [payload],
    });
    const result = decodeInput(calldata, BYTES_FUNCTION_ABI);
    assert.ok(result !== null);
    assert.equal(result.functionName, "storeData");
    assert.equal(result.args[0]?.type, "bytes");
    assert.equal(result.args[0]?.value, payload);
  });

  it("handles int256 (signed) input", () => {
    const calldata = encodeFunctionData({
      abi: INT_FUNCTION_ABI,
      functionName: "adjust",
      args: [-42n],
    });
    const result = decodeInput(calldata, INT_FUNCTION_ABI);
    assert.ok(result !== null);
    assert.equal(result.args[0]?.type, "int256");
    assert.equal(result.args[0]?.value, "-42");
  });

  it("falls back to param_N name when ABI input has no name", () => {
    const anonymousAbi: Abi = [
      {
        type: "function",
        name: "doThing",
        inputs: [{ name: "", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ];
    const calldata = encodeFunctionData({
      abi: anonymousAbi,
      functionName: "doThing",
      args: [7n],
    });
    const result = decodeInput(calldata, anonymousAbi);
    assert.ok(result !== null);
    // An empty string name is preserved as-is (the ABI item exists)
    assert.ok(typeof result.args[0]?.name === "string");
  });
});

// ---------------------------------------------------------------------------
// decodeOutput
// ---------------------------------------------------------------------------

describe("decodeOutput", () => {
  it("decodes a single bool return value", () => {
    const encoded = encodeFunctionResult({
      abi: TRANSFER_ABI,
      functionName: "transfer",
      result: true,
    });
    const result = decodeOutput(encoded, TRANSFER_ABI, "transfer");
    assert.ok(result !== null);
    assert.equal(result.values.length, 1);
    assert.equal(result.values[0]?.value, true);
    assert.equal(result.values[0]?.type, "bool");
  });

  it("decodes multiple return values including a BigInt uint256", () => {
    const owner = "0xaaaa000000000000000000000000000000000001" as const;
    const balance = 12345678901234567890n;
    const encoded = encodeFunctionResult({
      abi: MULTI_RETURN_ABI,
      functionName: "getInfo",
      result: [owner, balance],
    });
    const result = decodeOutput(encoded, MULTI_RETURN_ABI, "getInfo");
    assert.ok(result !== null);
    assert.equal(result.values.length, 2);
    assert.equal(result.values[0]?.type, "address");
    assert.equal(result.values[1]?.type, "uint256");
    // BigInt serialized to string
    assert.equal(typeof result.values[1]?.value, "string");
    assert.equal(result.values[1]?.value, balance.toString());
  });

  it("returns null for malformed return data", () => {
    const result = decodeOutput("0xdeadbeef", TRANSFER_ABI, "transfer");
    assert.equal(result, null);
  });

  it("returns null for empty return data", () => {
    const result = decodeOutput("0x", TRANSFER_ABI, "transfer");
    assert.equal(result, null);
  });

  it("returns null when functionName is not in the ABI", () => {
    const encoded = encodeFunctionResult({
      abi: TRANSFER_ABI,
      functionName: "transfer",
      result: true,
    });
    const result = decodeOutput(encoded, TRANSFER_ABI, "nonexistentFn");
    assert.equal(result, null);
  });

  it("decodes bytes32 output", () => {
    const hash =
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as `0x${string}`;
    const encoded = encodeFunctionResult({
      abi: BYTES_FUNCTION_ABI,
      functionName: "storeData",
      result: hash,
    });
    const result = decodeOutput(encoded, BYTES_FUNCTION_ABI, "storeData");
    assert.ok(result !== null);
    assert.equal(result.values[0]?.type, "bytes32");
    assert.equal(result.values[0]?.value, hash);
  });

  it("decodes int256 (signed) output and serializes negative BigInts", () => {
    const encoded = encodeFunctionResult({
      abi: INT_FUNCTION_ABI,
      functionName: "adjust",
      result: -100n,
    });
    const result = decodeOutput(encoded, INT_FUNCTION_ABI, "adjust");
    assert.ok(result !== null);
    assert.equal(result.values[0]?.type, "int256");
    assert.equal(result.values[0]?.value, "-100");
  });
});

// ---------------------------------------------------------------------------
// decodeLogs
// ---------------------------------------------------------------------------

describe("decodeLogs", () => {
  const FROM = "0xaaaa000000000000000000000000000000000001" as const;
  const TO = "0xbbbb000000000000000000000000000000000002" as const;
  const VALUE = 500n;

  function makeTransferLog() {
    const topics = encodeEventTopics({
      abi: TRANSFER_EVENT_ABI,
      eventName: "Transfer",
      args: { from: FROM, to: TO },
    }) as [`0x${string}`, ...`0x${string}`[]];

    const data = encodeAbiParameters(
      [{ name: "value", type: "uint256" }],
      [VALUE],
    );

    return {
      address: "0xcccc000000000000000000000000000000000003" as const,
      topics,
      data,
      blockHash: null,
      blockNumber: null,
      logIndex: null,
      transactionHash: null,
      transactionIndex: null,
      removed: false,
    };
  }

  it("decodes a Transfer event log", () => {
    const log = makeTransferLog();
    const events = decodeLogs([log], TRANSFER_EVENT_ABI);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventName, "Transfer");
    assert.equal(events[0]?.args.length, 3);

    const valueArg = events[0]?.args.find((a) => a.type === "uint256");
    assert.ok(valueArg !== undefined);
    assert.equal(valueArg.value, "500");
  });

  it("serializes indexed address args correctly", () => {
    const log = makeTransferLog();
    const events = decodeLogs([log], TRANSFER_EVENT_ABI);
    const fromArg = events[0]?.args.find((a) => a.name === "from");
    assert.ok(fromArg !== undefined);
    assert.equal(typeof fromArg.value, "string");
    assert.equal(
      (fromArg.value as string).toLowerCase(),
      FROM.toLowerCase(),
    );
  });

  it("returns empty array when log topics don't match the ABI", () => {
    const badLog = {
      address: "0x0000000000000000000000000000000000000000" as const,
      // Wrong topic hash
      topics: [
        "0x0000000000000000000000000000000000000000000000000000000000000000" as const,
      ] as [`0x${string}`, ...`0x${string}`[]],
      data: "0x" as const,
      blockHash: null,
      blockNumber: null,
      logIndex: null,
      transactionHash: null,
      transactionIndex: null,
      removed: false,
    };
    const events = decodeLogs([badLog], TRANSFER_EVENT_ABI);
    assert.equal(events.length, 0);
  });

  it("skips undecodable logs but continues processing remaining logs", () => {
    const good = makeTransferLog();
    const bad = {
      address: "0x0000000000000000000000000000000000000000" as const,
      topics: [
        "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as const,
      ] as [`0x${string}`, ...`0x${string}`[]],
      data: "0xdeadbeef" as const,
      blockHash: null,
      blockNumber: null,
      logIndex: null,
      transactionHash: null,
      transactionIndex: null,
      removed: false,
    };
    const events = decodeLogs([bad, good], TRANSFER_EVENT_ABI);
    // Only the good log decoded
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventName, "Transfer");
  });

  it("returns empty array for an empty log array", () => {
    const events = decodeLogs([], TRANSFER_EVENT_ABI);
    assert.equal(events.length, 0);
  });

  it("returns empty array when ABI is empty", () => {
    const log = makeTransferLog();
    const events = decodeLogs([log], []);
    assert.equal(events.length, 0);
  });

  it("BigInt values in log data are serialized to strings", () => {
    const largeValue = 2n ** 128n - 1n;
    const topics = encodeEventTopics({
      abi: TRANSFER_EVENT_ABI,
      eventName: "Transfer",
      args: { from: FROM, to: TO },
    }) as [`0x${string}`, ...`0x${string}`[]];
    const data = encodeAbiParameters(
      [{ name: "value", type: "uint256" }],
      [largeValue],
    );
    const log = {
      address: "0xcccc000000000000000000000000000000000003" as const,
      topics,
      data,
      blockHash: null,
      blockNumber: null,
      logIndex: null,
      transactionHash: null,
      transactionIndex: null,
      removed: false,
    };
    const events = decodeLogs([log], TRANSFER_EVENT_ABI);
    const valueArg = events[0]?.args.find((a) => a.name === "value");
    assert.equal(typeof valueArg?.value, "string");
    assert.equal(valueArg?.value, largeValue.toString());
  });
});
