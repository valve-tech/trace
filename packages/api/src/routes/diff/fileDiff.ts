import type { SourceFile } from "../../services/sourceCode.js";
import type { FileDiff } from "./types.js";
import { diffLines } from "./lcs.js";

/**
 * Three flavours of file-level diff. `compareFiles` runs the LCS diff
 * when both contracts have the same file. `fileAddedDiff` / `fileRemovedDiff`
 * are shortcuts when one side is missing — every line is added/removed
 * with no context, since there's nothing to align against.
 */
export function compareFiles(fileA: SourceFile, fileB: SourceFile): FileDiff {
  const aLines = fileA.content.split("\n");
  const bLines = fileB.content.split("\n");
  const lines = diffLines(aLines, bLines);

  const linesAdded = lines.filter((l) => l.type === "added").length;
  const linesRemoved = lines.filter((l) => l.type === "removed").length;

  return {
    filename: fileA.name,
    status: "changed",
    lines,
    linesAdded,
    linesRemoved,
  };
}

export function fileAddedDiff(file: SourceFile): FileDiff {
  const lines = file.content.split("\n").map((content, idx) => ({
    type: "added" as const,
    lineA: null,
    lineB: idx + 1,
    content,
  }));
  return {
    filename: file.name,
    status: "added",
    lines,
    linesAdded: lines.length,
    linesRemoved: 0,
  };
}

export function fileRemovedDiff(file: SourceFile): FileDiff {
  const lines = file.content.split("\n").map((content, idx) => ({
    type: "removed" as const,
    lineA: idx + 1,
    lineB: null,
    content,
  }));
  return {
    filename: file.name,
    status: "removed",
    lines,
    linesAdded: 0,
    linesRemoved: lines.length,
  };
}
