export interface LineInfo {
  line: number;
  column: number;
}

/**
 * Pre-compute the line-start offsets for a source string. Used by
 * `offsetToLineCol` to convert byte offsets to 1-indexed line/column
 * pairs in O(log n) via binary search.
 */
export function buildLineIndex(source: string): number[] {
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  return lineStarts;
}

export function offsetToLineCol(
  offset: number,
  lineStarts: number[],
): LineInfo {
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
    line: low + 1,
    column: offset - lineStarts[low]! + 1,
  };
}
