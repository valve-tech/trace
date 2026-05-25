import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stripMetadata,
  opcodeStructure,
  structuresMatch,
} from "../../src/services/solcCompiler/bytecodeStructure.js";

// A tiny runtime body: PUSH1 0x80 PUSH1 0x40 MSTORE  (6040526080... style)
// 60 80 60 40 52 → PUSH1 0x80, PUSH1 0x40, MSTORE
const BODY = "6080604052";

// Fake solc metadata: a blob + 2-byte length trailer. Here 4 bytes of blob
// (deadbeef) and length 0x0004.
const META = "deadbeef" + "0004";

describe("stripMetadata", () => {
  it("removes the trailing CBOR metadata using the 2-byte length trailer", () => {
    assert.equal(stripMetadata(BODY + META), BODY);
  });

  it("tolerates a leading 0x", () => {
    assert.equal(stripMetadata("0x" + BODY + META), BODY);
  });

  it("leaves bytecode unchanged when the encoded length is implausible", () => {
    // Trailer 0xffff claims 65535 bytes of metadata in a tiny string → ignore.
    const h = "6001" + "ffff";
    assert.equal(stripMetadata(h), h);
  });
});

describe("opcodeStructure", () => {
  it("lists opcodes and skips PUSH operands", () => {
    // PUSH1 0x80, PUSH1 0x40, MSTORE → [0x60, 0x60, 0x52]
    assert.deepEqual(opcodeStructure(BODY), [0x60, 0x60, 0x52]);
  });

  it("skips the full operand width of larger PUSH ops", () => {
    // PUSH3 0xAABBCC (62 aabbcc), then STOP (00) → [0x62, 0x00]
    assert.deepEqual(opcodeStructure("62aabbcc00"), [0x62, 0x00]);
  });

  it("strips metadata before disassembling", () => {
    assert.deepEqual(opcodeStructure(BODY + META), [0x60, 0x60, 0x52]);
  });
});

describe("structuresMatch", () => {
  it("is true for identical bytecode", () => {
    assert.equal(structuresMatch(BODY, BODY), true);
  });

  it("is true when only PUSH operands differ (the immutable / library case)", () => {
    // Same opcodes, different PUSH20 operand (an immutable address baked in at
    // deploy time vs zero in a fresh recompile). Identical metadata trailer on
    // both so stripping is symmetric.
    const meta = "deadbeefdead" + "0006"; // 6-byte blob + 2-byte length
    const zero = "73" + "00".repeat(20) + "00" + meta; // PUSH20 0…0, STOP
    const addr = "73" + "ab".repeat(20) + "00" + meta; // PUSH20 0xabab…, STOP
    assert.equal(structuresMatch(zero, addr), true);
  });

  it("is false when the opcode sequence differs", () => {
    // PUSH1 0x80 ADD  vs  PUSH1 0x80 MUL
    assert.equal(structuresMatch("600801", "600802"), false);
  });

  it("is false when lengths differ", () => {
    assert.equal(structuresMatch("6001", "600100"), false);
  });
});
