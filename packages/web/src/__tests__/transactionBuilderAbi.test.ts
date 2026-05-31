import { describe, it, expect } from "vitest";
import {
  getDefaultValue,
  getReadFunctions,
  getWriteFunctions,
  parseArgValue,
} from "../components/TransactionBuilder/abi";

/**
 * Unit tests for the ABI utilities extracted from TransactionBuilder.
 * parseArgValue is the highest-risk one — bugs there produce malformed
 * calldata that gets sent to a fork, where the failure mode is "tx
 * reverts with no obvious reason from the UI side". The defaults are
 * pinned down so the form doesn't regress to placeholder strings that
 * fail validation.
 */

const SAMPLE_ABI = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "approve", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [], outputs: [] },
  { type: "function", name: "totalSupply", stateMutability: "pure", inputs: [], outputs: [] },
  { type: "event", name: "Transfer", inputs: [] },
  { type: "error", name: "InsufficientBalance", inputs: [] },
  { type: "constructor", stateMutability: "nonpayable", inputs: [] },
] as const;

describe("getWriteFunctions", () => {
  it("keeps nonpayable + payable, excludes view + pure", () => {
    const names = getWriteFunctions(SAMPLE_ABI).map((f) => f.name);
    expect(names).toEqual(["transfer", "approve"]);
  });

  it("excludes events, errors, and the constructor (non-function ABI items)", () => {
    const items = getWriteFunctions(SAMPLE_ABI);
    expect(items.every((f) => f.type === "function")).toBe(true);
  });

  it("returns an empty array for an empty ABI", () => {
    expect(getWriteFunctions([])).toEqual([]);
  });

  it("returns an empty array when the ABI is all read functions", () => {
    expect(
      getWriteFunctions([
        { type: "function", name: "x", stateMutability: "view", inputs: [], outputs: [] },
      ]),
    ).toEqual([]);
  });
});

describe("getReadFunctions", () => {
  it("keeps view + pure, excludes nonpayable + payable", () => {
    const names = getReadFunctions(SAMPLE_ABI).map((f) => f.name);
    expect(names).toEqual(["balanceOf", "totalSupply"]);
  });

  it("excludes non-function ABI items (event, error, constructor)", () => {
    const items = getReadFunctions(SAMPLE_ABI);
    expect(items.every((f) => f.type === "function")).toBe(true);
  });
});

describe("getDefaultValue", () => {
  it("integer types default to '0'", () => {
    expect(getDefaultValue("uint256")).toBe("0");
    expect(getDefaultValue("uint8")).toBe("0");
    expect(getDefaultValue("int128")).toBe("0");
    expect(getDefaultValue("int")).toBe("0"); // alias for int256
  });

  it("bool defaults to 'false' (string, not boolean — input field expects text)", () => {
    expect(getDefaultValue("bool")).toBe("false");
  });

  it("address defaults to empty (no plausible placeholder)", () => {
    expect(getDefaultValue("address")).toBe("");
  });

  it("bytes types default to '0x' (valid empty bytes literal)", () => {
    expect(getDefaultValue("bytes")).toBe("0x");
    expect(getDefaultValue("bytes32")).toBe("0x");
  });

  it("string defaults to empty", () => {
    expect(getDefaultValue("string")).toBe("");
  });

  it("array types default to '[]' (valid empty JSON array)", () => {
    expect(getDefaultValue("uint256[]")).toBe("[]");
    expect(getDefaultValue("address[]")).toBe("[]");
  });

  it("unknown types fall through to empty (no risky guess)", () => {
    expect(getDefaultValue("tuple")).toBe("");
    expect(getDefaultValue("(uint256,address)")).toBe("");
  });

  it("array detection takes precedence over the element type's default", () => {
    // `uint256[]`, `bytes[]`, etc. all get "[]" — otherwise the form
    // pre-fills "0" or "0x" for an array slot and encoding fails on
    // submit. The array check runs first specifically for this reason.
    expect(getDefaultValue("uint256[]")).toBe("[]");
    expect(getDefaultValue("bytes[]")).toBe("[]");
    expect(getDefaultValue("bool[]")).toBe("[]");
  });
});

describe("parseArgValue", () => {
  it("uint types parse via BigInt (256-bit values survive)", () => {
    expect(parseArgValue("123", "uint256")).toBe(123n);
    // 2^200, well beyond Number.MAX_SAFE_INTEGER
    const big = (1n << 200n).toString();
    expect(parseArgValue(big, "uint256")).toBe(1n << 200n);
  });

  it("int types parse via BigInt and accept negative values", () => {
    expect(parseArgValue("-42", "int256")).toBe(-42n);
  });

  it("bool is a strict 'true' literal match — anything else is false", () => {
    expect(parseArgValue("true", "bool")).toBe(true);
    expect(parseArgValue("false", "bool")).toBe(false);
    expect(parseArgValue("True", "bool")).toBe(false); // case-sensitive
    expect(parseArgValue("1", "bool")).toBe(false);
    expect(parseArgValue("", "bool")).toBe(false);
  });

  it("array types JSON-parse the input", () => {
    expect(parseArgValue("[1,2,3]", "uint256[]")).toEqual([1, 2, 3]);
    expect(parseArgValue('["0xabc"]', "address[]")).toEqual(["0xabc"]);
  });

  it("array types return [] on invalid JSON (defensive fallback)", () => {
    expect(parseArgValue("not json", "uint256[]")).toEqual([]);
    expect(parseArgValue("", "uint256[]")).toEqual([]);
  });

  it("address/string/bytes types pass through as raw strings (viem validates)", () => {
    expect(parseArgValue("0xdead", "address")).toBe("0xdead");
    expect(parseArgValue("hello", "string")).toBe("hello");
    expect(parseArgValue("0xff", "bytes")).toBe("0xff");
    expect(parseArgValue("0x" + "00".repeat(32), "bytes32")).toBe(
      "0x" + "00".repeat(32),
    );
  });

  it("throws on a non-numeric uint input (BigInt throws — caller catches)", () => {
    // The component wraps parseArgValue in try/catch in handleSimulate
    // and surfaces "Encoding failed" to the user. Documented behavior.
    expect(() => parseArgValue("not-a-number", "uint256")).toThrow();
  });
});
