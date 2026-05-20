export type DiffLineType = "context" | "added" | "removed";

export interface DiffLine {
  type: DiffLineType;
  /** Line number in file A (null for added lines). */
  lineA: number | null;
  /** Line number in file B (null for removed lines). */
  lineB: number | null;
  content: string;
}

export interface FileDiff {
  filename: string;
  /** "changed" | "added" | "removed" — relative to A. */
  status: "changed" | "added" | "removed";
  lines: DiffLine[];
  linesAdded: number;
  linesRemoved: number;
}

export interface DiffSummary {
  filesChanged: number;
  filesAdded: number;
  filesRemoved: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
}
