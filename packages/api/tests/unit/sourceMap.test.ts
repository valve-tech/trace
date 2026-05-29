/**
 * Unit tests for the source-map decoder and the precomputed lookup helpers.
 *
 * Covers:
 *   - decodeSourceMap: full entry, empty-field inheritance, empty segment
 *   - buildPcToOpcodeIndex: non-PUSH / PUSH1 / PUSH32 bytecode
 *   - precomputeSourceMap: wires the parts together correctly
 *   - lookupPc: happy path, out-of-range PC, unresolvable file index
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decodeSourceMap,
  buildPcToOpcodeIndex,
} from "../../src/services/sourceMap/decode.js";
import {
  precomputeSourceMap,
  lookupPc,
} from "../../src/services/sourceMap/precompute.js";
import type { SourceFile } from "../../src/services/sourceCode.js";

// ---------------------------------------------------------------------------
// decodeSourceMap
// ---------------------------------------------------------------------------

describe("decodeSourceMap — full entry", () => {
  it("decodes a minimal single entry with all five fields", () => {
    const entries = decodeSourceMap("0:1:0:o:0");
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0], {
      offset: 0,
      length: 1,
      fileIndex: 0,
      jumpType: "o",
    });
  });

  it("decodes jump type 'i' (into function)", () => {
    const entries = decodeSourceMap("10:5:2:i:0");
    assert.equal(entries[0]!.jumpType, "i");
    assert.equal(entries[0]!.offset, 10);
    assert.equal(entries[0]!.length, 5);
    assert.equal(entries[0]!.fileIndex, 2);
  });

  it("decodes jump type '-' (regular statement)", () => {
    const entries = decodeSourceMap("0:10:0:-:0");
    assert.equal(entries[0]!.jumpType, "-");
  });

  it("decodes multiple semicolon-separated entries independently", () => {
    const entries = decodeSourceMap("0:10:0:-:0;20:5:1:i:0");
    assert.equal(entries.length, 2);
    assert.equal(entries[0]!.offset, 0);
    assert.equal(entries[1]!.offset, 20);
    assert.equal(entries[1]!.fileIndex, 1);
  });
});

describe("decodeSourceMap — empty-field inheritance (run-length compression)", () => {
  it("inherits previous offset when s field is empty", () => {
    // First entry: offset=5. Second entry: empty s → inherits 5.
    const entries = decodeSourceMap("5:10:0:-:0;:20:0:-:0");
    assert.equal(entries[1]!.offset, 5);
  });

  it("inherits previous length when l field is empty", () => {
    const entries = decodeSourceMap("0:10:0:-:0;5::0:-:0");
    assert.equal(entries[1]!.length, 10);
  });

  it("inherits previous fileIndex when f field is empty", () => {
    const entries = decodeSourceMap("0:10:2:-:0;0:10::-:0");
    assert.equal(entries[1]!.fileIndex, 2);
  });

  it("inherits previous jumpType when j field is empty", () => {
    const entries = decodeSourceMap("0:10:0:i:0;0:10:0::0");
    assert.equal(entries[1]!.jumpType, "i");
  });

  it("an entry with all empty fields is a full copy of the previous entry", () => {
    const entries = decodeSourceMap("3:7:1:o:0;::::");
    assert.deepEqual(entries[1], entries[0]);
  });

  it("an empty segment (;;) duplicates the previous entry", () => {
    // "1:2:0:-:0;;" → two explicit empty segments after the first entry
    const entries = decodeSourceMap("1:2:0:-:0;;");
    assert.equal(entries.length, 3);
    assert.deepEqual(entries[1], entries[0]);
    assert.deepEqual(entries[2], entries[0]);
  });

  it("starts with sensible defaults before the first entry", () => {
    // A map starting with all-empty fields should use the initial prev
    // (offset=0, length=0, fileIndex=0, jumpType="-").
    const entries = decodeSourceMap("::::");
    assert.deepEqual(entries[0], {
      offset: 0,
      length: 0,
      fileIndex: 0,
      jumpType: "-",
    });
  });
});

// ---------------------------------------------------------------------------
// buildPcToOpcodeIndex
// ---------------------------------------------------------------------------

describe("buildPcToOpcodeIndex", () => {
  it("maps each opcode byte offset → opcode index for non-PUSH ops", () => {
    // 00 = STOP, 01 = ADD, 02 = MUL  → three opcodes at pc=0,1,2
    const map = buildPcToOpcodeIndex("000102");
    assert.equal(map.get(0), 0);
    assert.equal(map.get(1), 1);
    assert.equal(map.get(2), 2);
    assert.equal(map.size, 3);
  });

  it("skips the PUSH1 operand byte (PUSH1 = 0x60)", () => {
    // PUSH1 0xAA → opcode at pc=0 (index 0), next opcode at pc=2 (index 1)
    const map = buildPcToOpcodeIndex("60aa00");
    assert.equal(map.get(0), 0); // PUSH1
    assert.equal(map.get(2), 1); // STOP
    assert.equal(map.has(1), false); // operand byte has no entry
  });

  it("skips the full operand of PUSH32 (0x7f)", () => {
    // PUSH32 followed by 32 zero bytes, then STOP
    const push32 = "7f" + "00".repeat(32) + "00";
    const map = buildPcToOpcodeIndex(push32);
    assert.equal(map.get(0), 0); // PUSH32 at pc=0
    assert.equal(map.get(33), 1); // STOP at pc=33
    assert.equal(map.has(1), false); // operand byte 1 is not an opcode
    assert.equal(map.has(32), false); // operand byte 32 is not an opcode
  });

  it("strips a 0x prefix before processing", () => {
    const withPrefix = buildPcToOpcodeIndex("0x000102");
    const withoutPrefix = buildPcToOpcodeIndex("000102");
    assert.deepEqual([...withPrefix.entries()], [...withoutPrefix.entries()]);
  });
});

// ---------------------------------------------------------------------------
// precomputeSourceMap + lookupPc
// ---------------------------------------------------------------------------

describe("lookupPc — happy path", () => {
  // Build a minimal contract:
  //   Bytecode:  STOP (0x00) → one opcode at pc=0, opcode index 0
  //   Source map: "0:5:0:-" → offset=0, length=5, fileIndex=0, jumpType="-"
  //   Source file: "hello" (5 chars)

  const FILES: SourceFile[] = [{ name: "Test.sol", content: "hello" }];

  it("returns the correct SourceLocation for pc=0", () => {
    const precomputed = precomputeSourceMap("00", "0:5:0:-:0", FILES);
    const loc = lookupPc(0, precomputed);
    assert.ok(loc !== null);
    assert.equal(loc.file, "Test.sol");
    assert.equal(loc.line, 1);
    assert.equal(loc.column, 1);
    assert.equal(loc.sourceSnippet, "hello");
    assert.equal(loc.jumpType, "-");
  });

  it("includes correct endLine/endColumn for a multi-char snippet", () => {
    // "ab\ncd" — offset=0, length=5 spans both lines
    const files: SourceFile[] = [{ name: "F.sol", content: "ab\ncd" }];
    const precomputed = precomputeSourceMap("00", "0:5:0:-:0", files);
    const loc = lookupPc(0, precomputed);
    assert.ok(loc !== null);
    assert.equal(loc.line, 1);
    assert.equal(loc.endLine, 2);
    assert.equal(loc.endColumn, 3); // column after "cd"
  });

  it("decodes jumpType 'i' correctly", () => {
    const files: SourceFile[] = [{ name: "G.sol", content: "pragma solidity" }];
    const precomputed = precomputeSourceMap("00", "0:6:0:i:0", files);
    const loc = lookupPc(0, precomputed);
    assert.ok(loc !== null);
    assert.equal(loc.jumpType, "i");
  });
});

describe("lookupPc — out-of-range PC", () => {
  it("returns null when PC does not correspond to any opcode", () => {
    // Bytecode "60aa" = PUSH1 0xaa; pc=1 is the operand, not an opcode.
    const files: SourceFile[] = [{ name: "T.sol", content: "x" }];
    const precomputed = precomputeSourceMap("60aa", "0:1:0:-:0;0:1:0:-:0", files);
    assert.equal(lookupPc(1, precomputed), null); // operand byte
  });

  it("returns null for a PC far beyond the end of bytecode", () => {
    const files: SourceFile[] = [{ name: "T.sol", content: "x" }];
    const precomputed = precomputeSourceMap("00", "0:1:0:-:0", files);
    assert.equal(lookupPc(9999, precomputed), null);
  });
});

describe("lookupPc — unresolvable file index", () => {
  it("returns null when source map entry fileIndex is negative", () => {
    // fileIndex=-1 means compiler-generated; no source to show.
    const files: SourceFile[] = [{ name: "T.sol", content: "x" }];
    const precomputed = precomputeSourceMap("00", "0:1:-1:-:0", files);
    assert.equal(lookupPc(0, precomputed), null);
  });

  it("returns null when fileIndex exceeds the sourceFiles array length", () => {
    // Source map references file index 5 but only one file is provided.
    const files: SourceFile[] = [{ name: "T.sol", content: "x" }];
    const precomputed = precomputeSourceMap("00", "0:1:5:-:0", files);
    assert.equal(lookupPc(0, precomputed), null);
  });

  it("returns null when sourceFiles is empty", () => {
    const precomputed = precomputeSourceMap("00", "0:1:0:-:0", []);
    assert.equal(lookupPc(0, precomputed), null);
  });
});

describe("lookupPc — source map entry count mismatch", () => {
  it("returns null when opcode index exceeds the source map entry array", () => {
    // Two opcodes (pc=0 and pc=1) but only one source map entry.
    const files: SourceFile[] = [{ name: "T.sol", content: "xy" }];
    const precomputed = precomputeSourceMap("0000", "0:1:0:-:0", files);
    // pc=0 → opcodeIndex=0 → entry[0] exists → should succeed
    assert.ok(lookupPc(0, precomputed) !== null);
    // pc=1 → opcodeIndex=1 → entry[1] is undefined → should return null
    assert.equal(lookupPc(1, precomputed), null);
  });
});
