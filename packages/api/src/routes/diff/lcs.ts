import type { DiffLine } from "./types.js";

/**
 * Classic LCS-based unified diff. Build the longest-common-subsequence
 * table, then walk it back-to-front emitting (context | added | removed)
 * lines, reversing at the end so the output reads forwards.
 *
 * Complexity is O(N*M) in time and memory — fine for source files but
 * pathological for very large blobs. The current consumer is contract
 * source diff where files are bounded; if we ever apply this to traces
 * or transaction inputs, switch to an O((N+M)D) Myers diff instead.
 */
function buildLcsTable(aLines: string[], bLines: string[]): number[][] {
  const aLen = aLines.length;
  const bLen = bLines.length;
  const table: number[][] = Array.from({ length: aLen + 1 }, () =>
    new Array<number>(bLen + 1).fill(0),
  );

  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      if (aLines[i - 1] === bLines[j - 1]) {
        table[i]![j] = table[i - 1]![j - 1]! + 1;
      } else {
        table[i]![j] = Math.max(table[i - 1]![j]!, table[i]![j - 1]!);
      }
    }
  }
  return table;
}

export function diffLines(aLines: string[], bLines: string[]): DiffLine[] {
  const table = buildLcsTable(aLines, bLines);
  const result: DiffLine[] = [];

  let i = aLines.length;
  let j = bLines.length;

  while (i > 0 || j > 0) {
    const aLine = aLines[i - 1];
    const bLine = bLines[j - 1];

    if (i > 0 && j > 0 && aLine === bLine) {
      result.push({ type: "context", lineA: i, lineB: j, content: aLine! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || table[i]![j - 1]! >= table[i - 1]![j]!)) {
      result.push({ type: "added", lineA: null, lineB: j, content: bLine! });
      j--;
    } else {
      result.push({ type: "removed", lineA: i, lineB: null, content: aLine! });
      i--;
    }
  }

  result.reverse();
  return result;
}
