import { formatEther } from "viem";
import {
  formatDecodedValue,
  type DecodedRow,
} from "../../lib/storageDecode";

/**
 * Pure formatters extracted from StateDiffPanel. No React, no DOM — just
 * value transformations the panel uses to render its rows. Lives in its
 * own file so the diffs are unit-testable without rendering React.
 */

/**
 * Truncate a hex string for inline display: `0xabcdef…1234`. Preserves the
 * full original when it's already short enough to fit (no truncation
 * marker for already-readable values).
 */
export function truncateHex(
  value: string,
  prefixChars = 6,
  suffixChars = 4,
): string {
  if (value.length <= prefixChars + suffixChars + 2) return value;
  return `${value.slice(0, prefixChars)}...${value.slice(-suffixChars)}`;
}

/**
 * Format a wei amount as a human-readable PLS string. Up to 6 significant
 * decimals, trailing zeros stripped, "0" for exact zero. Falls back to the
 * raw input if it isn't a valid BigInt — defensive against malformed
 * upstream payloads but unlikely in practice.
 */
export function formatPlsValue(wei: string): string {
  try {
    const formatted = formatEther(BigInt(wei));
    const num = parseFloat(formatted);
    if (num === 0) return "0";
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
  } catch {
    return wei;
  }
}

/**
 * Did the balance go up? Negative-prefixed strings short-circuit to false
 * (saves a BigInt parse for the common "loss" case); otherwise compared as
 * a signed BigInt to handle wei amounts that don't fit in Number.
 */
export function isDeltaPositive(delta: string): boolean {
  if (delta.startsWith("-")) return false;
  const n = BigInt(delta);
  return n > 0n;
}

/**
 * Format a typed-decoded storage value for inline display: addresses and
 * raw bytes get truncated to a `0xabcdef…12345678` form so they don't
 * overflow their cell; other kinds (numbers, bools, strings) render as-is
 * via the SDK helper. Returns null when the decoder couldn't produce a
 * displayable value (e.g. unknown kind), so the caller can fall back to
 * the raw hex.
 */
export function formatDecodedShort(
  decoded: DecodedRow["before"],
): string | null {
  const text = formatDecodedValue(decoded);
  if (text === null) return null;
  if (decoded.kind === "address" || decoded.kind === "bytes") {
    return truncateHex(text, 8, 6);
  }
  return text;
}
