import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  etherscanErr,
  etherscanOk,
} from "../../src/routes/etherscan/envelope.js";
import {
  lookupVerifyResult,
  storeVerifyResult,
  __resetForTesting,
} from "../../src/routes/etherscan/verifyShim.js";

describe("etherscan envelope", () => {
  it("wraps success with status=1 and OK message", () => {
    assert.deepEqual(etherscanOk({ a: 1 }), {
      status: "1",
      message: "OK",
      result: { a: 1 },
    });
  });

  it("wraps strings/arrays/numbers as-is", () => {
    assert.deepEqual(etherscanOk("abi-json-string"), {
      status: "1",
      message: "OK",
      result: "abi-json-string",
    });
    assert.deepEqual(etherscanOk([1, 2, 3]), {
      status: "1",
      message: "OK",
      result: [1, 2, 3],
    });
  });

  it("wraps failure with status=0 and NOTOK by default", () => {
    assert.deepEqual(etherscanErr("Invalid Address format"), {
      status: "0",
      message: "NOTOK",
      result: "Invalid Address format",
    });
  });

  it("allows a custom message", () => {
    assert.deepEqual(
      etherscanErr("No transactions found", "No transactions found"),
      {
        status: "0",
        message: "No transactions found",
        result: "No transactions found",
      },
    );
  });
});

describe("etherscan verify shim", () => {
  it("returns a GUID and looks up the stored result", () => {
    __resetForTesting();
    const guid = storeVerifyResult({ kind: "pass", match: "perfect" });
    assert.match(guid, /^[0-9a-f-]{36}$/);
    assert.deepEqual(lookupVerifyResult(guid), {
      kind: "pass",
      match: "perfect",
    });
  });

  it("retains failure payloads with the upstream error string", () => {
    __resetForTesting();
    const guid = storeVerifyResult({
      kind: "fail",
      error: "deployed bytecode does not match",
    });
    assert.deepEqual(lookupVerifyResult(guid), {
      kind: "fail",
      error: "deployed bytecode does not match",
    });
  });

  it("returns null for an unknown GUID", () => {
    __resetForTesting();
    assert.equal(
      lookupVerifyResult("00000000-0000-0000-0000-000000000000"),
      null,
    );
  });

  it("issues distinct GUIDs across multiple submissions", () => {
    __resetForTesting();
    const a = storeVerifyResult({ kind: "pass", match: "perfect" });
    const b = storeVerifyResult({ kind: "pass", match: "partial" });
    assert.notEqual(a, b);
    assert.equal(lookupVerifyResult(a)?.kind, "pass");
    assert.equal(
      (lookupVerifyResult(b) as { match?: string } | null)?.match,
      "partial",
    );
  });
});
