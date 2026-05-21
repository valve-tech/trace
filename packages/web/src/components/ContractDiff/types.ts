export type DiffLineType = "context" | "added" | "removed";

export interface DiffLine {
  type: DiffLineType;
  lineA: number | null;
  lineB: number | null;
  content: string;
}

export interface FileDiff {
  filename: string;
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

export interface DiffResult {
  contractA: { address: string; name: string | null };
  contractB: { address: string; name: string | null };
  files: FileDiff[];
  summary: DiffSummary;
}

export interface DiffResponse {
  ok: boolean;
  diff?: DiffResult;
  error?: string;
}
