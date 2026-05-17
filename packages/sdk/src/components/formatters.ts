import type { Address, Hex } from "viem";

/** Truncate `0xabcd1234...0001` style. Returns input unchanged if shorter than 12 chars. */
export function truncateAddress(addr: Address | string | null): string {
  if (!addr) return "0x0";
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Format a gas bigint with locale-aware thousands separators. */
export function formatGas(gas: bigint): string {
  return gas.toLocaleString();
}

/**
 * Format a wei value as a human-readable string with up to 18 decimals,
 * trimming trailing zeros. Returns null when the value is exactly 0n so
 * callers can hide the cell.
 */
export function formatWei(value: bigint, symbol: string = "PLS"): string | null {
  if (value === 0n) return null;
  const whole = value / 10n ** 18n;
  const frac = value % 10n ** 18n;
  if (frac === 0n) return `${whole} ${symbol}`;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fracStr} ${symbol}`;
}

/** Extract a 4-byte function selector from calldata, or "(fallback)" for empty calldata. */
export function getFunctionSelector(input: Hex): string {
  if (!input || input === "0x" || input.length < 10) return "(fallback)";
  return input.slice(0, 10);
}
