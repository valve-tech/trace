import { formatUnits, parseUnits } from "viem";

/**
 * Render a raw base-unit integer as a human token amount — THE single place
 * chain amounts are transformed for display.
 *
 * Explore is a 1:1 mirror of chain data: storage and the API keep raw integers
 * (wei, token base units), never a derived/scaled value. Decimals are applied
 * here, at the render edge, so the stored facts stay faithful and any surface
 * can format consistently.
 *
 * `decimals === null` means the scale isn't known (e.g. a token whose
 * `decimals()` hasn't been read yet) — show the raw integer verbatim rather
 * than guessing a scale. `symbol`, when given, is appended ("1.5 USDC").
 */
export function formatTokenAmount(
  raw: bigint | string,
  decimals: number | null,
  symbol?: string | null,
): string {
  const value = typeof raw === "bigint" ? raw : BigInt(raw);
  if (decimals === null) return value.toString();
  const scaled = formatUnits(value, decimals);
  return symbol ? `${scaled} ${symbol}` : scaled;
}

export interface AmountDisplayOptions {
  /** Cap fraction digits for readability. Truncates (never rounds up) so the
   *  shown value never overstates the on-chain amount. Omit for full precision. */
  maxFractionDigits?: number;
  /** Appended after the number when present ("1,234.5 USDC"). */
  symbol?: string | null;
  /** Group the integer part with thousands separators. Default true. */
  group?: boolean;
}

/**
 * Display form of a raw base-unit amount: exact `formatUnits` scaling, then
 * thousands grouping and fraction-capping done by STRING manipulation — never
 * `Number()`/`parseFloat`, so a balance past 2^53 wei stays exact. This is the
 * one display transform UI surfaces should route through.
 */
export function formatAmountDisplay(
  raw: bigint | string,
  decimals: number | null,
  options: AmountDisplayOptions = {},
): string {
  const { maxFractionDigits, symbol, group = true } = options;
  const exact = formatTokenAmount(raw, decimals); // exact decimal string, no symbol
  let [intPart = "0", fracPart = ""] = exact.split(".");

  const negative = intPart.startsWith("-");
  if (negative) intPart = intPart.slice(1);
  if (maxFractionDigits != null) {
    ({ intPart, fracPart } = capFraction(intPart, fracPart, maxFractionDigits));
  }
  if (group) intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  fracPart = fracPart.replace(/0+$/, "");

  const body = `${negative ? "-" : ""}${intPart}${fracPart ? `.${fracPart}` : ""}`;
  return symbol ? `${body} ${symbol}` : body;
}

/**
 * Cap a decimal's fraction to `maxFrac` digits with base-10 round-half-up,
 * carrying into the integer part when needed (0.9996 → 1.000). All-bigint, so
 * it's exact for arbitrarily large integer parts — no float rounding.
 */
function capFraction(
  intPart: string,
  fracPart: string,
  maxFrac: number,
): { intPart: string; fracPart: string } {
  if (fracPart.length <= maxFrac) return { intPart, fracPart };
  const kept = fracPart.slice(0, maxFrac);
  const roundUp = fracPart.charCodeAt(maxFrac) - 48 >= 5;
  if (!roundUp) return { intPart, fracPart: kept };

  // Increment the integer formed by (intPart + kept) by one ulp, then re-split.
  const incremented = (BigInt(intPart + kept) + 1n).toString();
  if (maxFrac === 0) return { intPart: incremented, fracPart: "" };
  const padded = incremented.padStart(maxFrac + 1, "0"); // keep at least 1 int digit
  return {
    intPart: padded.slice(0, -maxFrac),
    fracPart: padded.slice(-maxFrac),
  };
}

/**
 * Parse a human-entered decimal amount into a raw base-unit bigint, EXACTLY
 * via viem `parseUnits` — never `Math.floor(x * 1e18)`, which rounds the input
 * through a float. Returns null for blank or malformed input, so callers treat
 * "no value" and "bad value" the same way.
 */
export function parseAmountToBase(
  human: string,
  decimals: number,
): bigint | null {
  const v = human.trim();
  if (!v) return null;
  try {
    return parseUnits(v, decimals);
  } catch {
    return null;
  }
}

/**
 * Exact wei → gwei display (decimals 9): scale + group + cap, no `Number()`.
 * Returns null on null/garbage input so callers can render a placeholder.
 */
export function formatGwei(
  wei: string | null,
  maxFractionDigits = 2,
): string | null {
  if (wei == null) return null;
  try {
    return formatAmountDisplay(BigInt(wei), 9, { maxFractionDigits });
  } catch {
    return null;
  }
}
