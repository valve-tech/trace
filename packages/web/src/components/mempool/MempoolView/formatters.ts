/**
 * Pure formatters extracted from MempoolView. No React, no DOM — just wei
 * → display transformations shared by the gas cell and (transitively) the
 * sort comparator. Lives in its own file so the conversions are
 * unit-testable without rendering a table.
 */

/**
 * Parse a wei decimal string into a BigInt, treating null/non-numeric
 * input as zero. The comparator uses this so a tx missing a fee field
 * (e.g. a legacy tx with no `maxFeePerGas`) compares as if it had a
 * zero fee, rather than throwing.
 */
export function bigintOf(wei: string | null): bigint {
  if (wei == null) return 0n;
  try {
    return BigInt(wei);
  } catch {
    return 0n;
  }
}

/**
 * Format a wei decimal string as a gwei display value with up to 3
 * fractional digits and locale grouping. Returns null for null/garbage
 * input so the caller can render an em-dash placeholder instead of "0".
 */
export function gweiDisp(wei: string | null): string | null {
  if (wei == null) return null;
  try {
    const g = Number(BigInt(wei)) / 1e9;
    if (!isFinite(g)) return null;
    return g.toLocaleString(undefined, { maximumFractionDigits: 3 });
  } catch {
    return null;
  }
}
