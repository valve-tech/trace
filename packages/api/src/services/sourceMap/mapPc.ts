import type { SourceFile } from "../sourceCode.js";
import { buildPcToOpcodeIndex, decodeSourceMap } from "./decode.js";
import { buildLineIndex, offsetToLineCol } from "./lineIndex.js";

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  sourceSnippet: string;
  /** Jump type from the source map: "i" into function, "o" out, "-" regular. */
  jumpType: string;
}

/**
 * One-shot PC → SourceLocation. Builds the bytecode index, decodes the
 * source map, and walks the line index every call — fine for a handful
 * of lookups, but use `precomputeSourceMap` + `lookupPc` (see
 * ./precompute.ts) for hot paths like trace replay.
 */
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

  // File index < 0 means "no source" (compiler-generated code).
  if (entry.fileIndex < 0 || entry.fileIndex >= sourceFiles.length) {
    return null;
  }

  const file = sourceFiles[entry.fileIndex]!;
  const lineStarts = buildLineIndex(file.content);

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
