import type { SourceFile } from "./sourceCode.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceMapEntry {
  offset: number;
  length: number;
  fileIndex: number;
  jumpType: string; // "i" = into, "o" = out, "-" = regular
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  sourceSnippet: string;
}

// ---------------------------------------------------------------------------
// Source map decoder
//
// Solidity compiler source maps are encoded as semicolon-separated entries.
// Each entry is "s:l:f:j:m" where:
//   s = byte offset in source
//   l = byte length in source
//   f = source file index
//   j = jump type (i=into, o=out, -=regular)
//   m = modifier depth (ignored here)
//
// Empty fields inherit from the previous entry (run-length compression).
// ---------------------------------------------------------------------------

export function decodeSourceMap(encoded: string): SourceMapEntry[] {
  const entries: SourceMapEntry[] = [];
  let prev: SourceMapEntry = { offset: 0, length: 0, fileIndex: 0, jumpType: "-" };

  for (const raw of encoded.split(";")) {
    if (raw === "") {
      entries.push({ ...prev });
      continue;
    }

    const parts = raw.split(":");
    const entry: SourceMapEntry = {
      offset: parts[0] !== undefined && parts[0] !== "" ? parseInt(parts[0], 10) : prev.offset,
      length: parts[1] !== undefined && parts[1] !== "" ? parseInt(parts[1], 10) : prev.length,
      fileIndex: parts[2] !== undefined && parts[2] !== "" ? parseInt(parts[2], 10) : prev.fileIndex,
      jumpType: parts[3] !== undefined && parts[3] !== "" ? parts[3] : prev.jumpType,
    };

    entries.push(entry);
    prev = entry;
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Bytecode → PC mapping
//
// Walk the deployed bytecode to build a mapping from opcode index to byte
// offset (PC). EVM opcodes are 1 byte except PUSH1–PUSH32 which consume
// 1 + N bytes (where N is the push width).
// ---------------------------------------------------------------------------

export function buildPcToOpcodeIndex(deployedBytecode: string): Map<number, number> {
  const bytecode = deployedBytecode.startsWith("0x")
    ? deployedBytecode.slice(2)
    : deployedBytecode;

  const pcToIndex = new Map<number, number>();
  let opcodeIndex = 0;
  let pc = 0;

  while (pc < bytecode.length / 2) {
    pcToIndex.set(pc, opcodeIndex);

    const opcodeByte = parseInt(bytecode.slice(pc * 2, pc * 2 + 2), 16);

    // PUSH1 (0x60) through PUSH32 (0x7f) consume extra bytes
    if (opcodeByte >= 0x60 && opcodeByte <= 0x7f) {
      const pushSize = opcodeByte - 0x5f; // PUSH1 = 1 byte, PUSH32 = 32 bytes
      pc += 1 + pushSize;
    } else {
      pc += 1;
    }

    opcodeIndex++;
  }

  return pcToIndex;
}

// ---------------------------------------------------------------------------
// Line number computation
//
// Given source text, build a lookup from byte offset to line:column.
// ---------------------------------------------------------------------------

interface LineInfo {
  line: number;
  column: number;
}

function buildLineIndex(source: string): number[] {
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  return lineStarts;
}

function offsetToLineCol(offset: number, lineStarts: number[]): LineInfo {
  // Binary search for the line containing this offset
  let low = 0;
  let high = lineStarts.length - 1;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineStarts[mid]! <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return {
    line: low + 1, // 1-indexed
    column: offset - lineStarts[low]! + 1, // 1-indexed
  };
}

// ---------------------------------------------------------------------------
// Map a PC value to a source location
// ---------------------------------------------------------------------------

export function mapPcToSource(
  pc: number,
  deployedBytecode: string,
  encodedSourceMap: string,
  sourceFiles: SourceFile[],
): SourceLocation | null {
  const pcToIndex = buildPcToOpcodeIndex(deployedBytecode);
  const sourceMapEntries = decodeSourceMap(encodedSourceMap);

  const opcodeIndex = pcToIndex.get(pc);
  if (opcodeIndex === undefined) return null;

  const entry = sourceMapEntries[opcodeIndex];
  if (!entry) return null;

  // File index -1 means "no source" (compiler-generated code)
  if (entry.fileIndex < 0 || entry.fileIndex >= sourceFiles.length) return null;

  const file = sourceFiles[entry.fileIndex]!;
  const lineStarts = buildLineIndex(file.content);

  const start = offsetToLineCol(entry.offset, lineStarts);
  const end = offsetToLineCol(entry.offset + entry.length, lineStarts);

  // Extract the source snippet
  const snippet = file.content.slice(entry.offset, entry.offset + entry.length);

  return {
    file: file.name,
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
    sourceSnippet: snippet,
  };
}

// ---------------------------------------------------------------------------
// Precomputed mapping for an entire trace
//
// Build the lookup once and reuse for every step, avoiding repeated
// bytecode/source-map parsing.
// ---------------------------------------------------------------------------

export interface PrecomputedSourceMap {
  entries: SourceMapEntry[];
  pcToIndex: Map<number, number>;
  lineStartsByFile: Map<number, number[]>;
  sourceFiles: SourceFile[];
}

export function precomputeSourceMap(
  deployedBytecode: string,
  encodedSourceMap: string,
  sourceFiles: SourceFile[],
): PrecomputedSourceMap {
  return {
    entries: decodeSourceMap(encodedSourceMap),
    pcToIndex: buildPcToOpcodeIndex(deployedBytecode),
    lineStartsByFile: new Map(
      sourceFiles.map((f, i) => [i, buildLineIndex(f.content)]),
    ),
    sourceFiles,
  };
}

export function lookupPc(
  pc: number,
  precomputed: PrecomputedSourceMap,
): SourceLocation | null {
  const opcodeIndex = precomputed.pcToIndex.get(pc);
  if (opcodeIndex === undefined) return null;

  const entry = precomputed.entries[opcodeIndex];
  if (!entry) return null;

  if (entry.fileIndex < 0 || entry.fileIndex >= precomputed.sourceFiles.length) return null;

  const file = precomputed.sourceFiles[entry.fileIndex]!;
  const lineStarts = precomputed.lineStartsByFile.get(entry.fileIndex);
  if (!lineStarts) return null;

  const start = offsetToLineCol(entry.offset, lineStarts);
  const end = offsetToLineCol(entry.offset + entry.length, lineStarts);
  const snippet = file.content.slice(entry.offset, entry.offset + entry.length);

  return {
    file: file.name,
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
    sourceSnippet: snippet,
  };
}
