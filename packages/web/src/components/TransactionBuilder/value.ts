/**
 * PLS-amount parsing for TransactionBuilder. Extracted from the
 * simulate handler so the precision behavior is testable in isolation.
 *
 * Note on precision: this routes through `parseFloat`, which means any
 * input with more than ~15 significant decimal digits loses precision.
 * That's acceptable for the builder UI (a human typing a value), but
 * if we ever need exact wei from a 256-bit decimal we should switch to
 * viem's `parseEther`. The tests below pin down which inputs survive
 * the round trip and which silently round.
 */

const WEI_PER_PLS = 10n ** 18n;

/**
 * Convert a human-typed PLS amount (e.g. "1.5", "0.001") into a
 * 0x-prefixed wei hex string suitable for JSON-RPC `value`. Returns
 * null when the input is empty, zero, negative, or not a finite
 * number — the caller treats null as "don't send `value` at all".
 */
export function plsToWei(value: string): `0x${string}` | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  const wei = BigInt(Math.floor(n * Number(WEI_PER_PLS)));
  return `0x${wei.toString(16)}`;
}
