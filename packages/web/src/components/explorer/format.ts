export function truncateAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

/** Render a non-negative integer as Unicode subscript digits. */
function toSubscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUBSCRIPT_DIGITS[Number(d)] ?? d)
    .join("");
}

/**
 * Compact decimal rendering for very small magnitudes using the
 * leading-zero-subscript notation popularized by DEX UIs:
 *
 *   0.00000000123  →  "0.0₈123"   (₈ = eight leading zeros after the point)
 *
 * Only kicks in at 3+ leading zeros — below that, plain decimals read fine.
 * Returns a plain string (Unicode subscripts, not <sub>) so it drops into any
 * text context without changing call sites. Returns null when the value is
 * zero or large enough that normal formatting should be used instead.
 */
export function subscriptSmall(num: number, sigFigs = 4): string | null {
  if (num === 0 || !isFinite(num)) return null;
  const [mantissa, expPart] = Math.abs(num).toExponential().split("e");
  const exp = parseInt(expPart ?? "0", 10);
  // leadingZeros = digits between the decimal point and the first significant
  // figure. exp === -1 → 0 leading zeros, -4 → 3 leading zeros, etc.
  const leadingZeros = -exp - 1;
  if (leadingZeros < 3) return null; // plain decimal handles these
  const digits = (mantissa ?? "0").replace(".", "").slice(0, sigFigs);
  const sign = num < 0 ? "-" : "";
  return `${sign}0.0${toSubscript(leadingZeros)}${digits}`;
}

export function formatPLS(valuePLS: string): string {
  const num = parseFloat(valuePLS);
  if (num === 0) return "0 PLS";
  const small = subscriptSmall(num);
  if (small !== null) return `${small} PLS`;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 6 })} PLS`;
}
