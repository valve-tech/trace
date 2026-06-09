import { formatUnits } from "viem";

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
