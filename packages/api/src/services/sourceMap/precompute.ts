import type { SourceFile } from "../sourceCode.js";
import {
  buildPcToOpcodeIndex,
  decodeSourceMap,
  type SourceMapEntry,
} from "./decode.js";
import { buildLineIndex, offsetToLineCol } from "./lineIndex.js";
import type { SourceLocation } from "./mapPc.js";

/**
 * Precomputed lookup tables for a single contract. Build this once for
 * a trace and pass it to `lookupPc` for every step — avoids the
 * O(bytecode + sourcemap + files) cost of `mapPcToSource` on each call.
 */
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

  if (
    entry.fileIndex < 0 ||
    entry.fileIndex >= precomputed.sourceFiles.length
  ) {
    return null;
  }

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
    jumpType: entry.jumpType,
  };
}
