import { getAddress } from "viem";
import type { DecodedValue, DecodeSlotInput } from "./types.js";

/**
 * Decode a single storage-slot variable from its raw bytes32 value and
 * solc-style type info. Pure: no I/O, no chain reads, no recursion into
 * mappings or dynamic arrays.
 *
 * Solidity packs smaller types right-to-left into a slot — `offset` is
 * the byte position from the LEAST-significant end, and `numberOfBytes`
 * is the width. Example: a 32-byte slot holding `[bool a, uint8 b,
 * uint16 c]` has a at offset 0 (1 byte), b at offset 1 (1 byte), and
 * c at offset 2 (2 bytes). To read each, we slice the slot's hex from
 * the right.
 *
 * v1 covers the `inplace` encoding family — address (and contract
 * types treated as addresses), bool, uint{8..256}, int{8..256} (two's
 * complement), and bytes{1..32}. Enums are decoded as small uints.
 * Anything else returns `{ kind: "unsupported" }` and the caller falls
 * back to showing the raw slot value.
 */
export function decodeSlot(input: DecodeSlotInput): DecodedValue {
  const { slotValue, typeLabel, offset, numberOfBytes } = input;

  // Slot value must be 0x + 64 hex chars (32 bytes). Any other shape
  // means our caller passed something malformed — surface as unsupported
  // rather than throwing, so a single bad row doesn't blow up the panel.
  if (!/^0x[0-9a-fA-F]{64}$/.test(slotValue)) {
    return { kind: "unsupported", reason: `malformed slot value: ${slotValue}` };
  }
  if (offset < 0 || numberOfBytes <= 0 || offset + numberOfBytes > 32) {
    return {
      kind: "unsupported",
      reason: `out-of-range slice (offset=${offset}, width=${numberOfBytes})`,
    };
  }

  const sliceHex = extractPackedBytes(slotValue, offset, numberOfBytes);

  // `contract X` is laid out as a 20-byte address; render the same way.
  // Match the bare label and the common "contract " prefix.
  if (typeLabel === "address" || typeLabel.startsWith("contract ")) {
    return decodeAddress(sliceHex, numberOfBytes);
  }

  if (typeLabel === "bool") {
    return decodeBool(sliceHex);
  }

  // Enum is a small uint sized to the variant count; treat as uint.
  if (typeLabel.startsWith("enum ")) {
    return decodeUint(sliceHex, numberOfBytes);
  }

  const uintBits = parseIntegerTypeBits(typeLabel, "uint");
  if (uintBits !== null) {
    return decodeUint(sliceHex, numberOfBytes, uintBits);
  }

  const intBits = parseIntegerTypeBits(typeLabel, "int");
  if (intBits !== null) {
    return decodeInt(sliceHex, numberOfBytes, intBits);
  }

  const bytesSize = parseFixedBytesSize(typeLabel);
  if (bytesSize !== null) {
    return decodeFixedBytes(sliceHex, bytesSize);
  }

  return { kind: "unsupported", reason: `type not supported: ${typeLabel}` };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract `numberOfBytes` from the slot's hex at byte `offset` (counted
 * from the LEAST-significant end, matching solc's packing). The slot is
 * `0x` + 64 hex chars; we strip the prefix and slice from the right.
 */
function extractPackedBytes(
  slotValue: string,
  offset: number,
  numberOfBytes: number,
): string {
  const hex = slotValue.slice(2);
  // Position counted from the right edge in nibbles. Example: offset=0
  // numberOfBytes=1 grabs the LAST two nibbles ("the lowest byte").
  const end = hex.length - offset * 2;
  const start = end - numberOfBytes * 2;
  return hex.slice(start, end);
}

/**
 * Match `uintN` / `intN`. Returns the bit width or `null` if `label`
 * isn't this integer family. Solidity allows widths in 8-bit steps from
 * 8 through 256; we accept any multiple-of-8 in that range rather than
 * hard-coding each variant so future widths Just Work.
 */
function parseIntegerTypeBits(
  label: string,
  prefix: "uint" | "int",
): number | null {
  if (!label.startsWith(prefix)) return null;
  const rest = label.slice(prefix.length);
  if (rest === "") return 256; // bare "uint"/"int" is the 256-bit form
  if (!/^\d+$/.test(rest)) return null;
  const bits = Number(rest);
  if (bits < 8 || bits > 256 || bits % 8 !== 0) return null;
  return bits;
}

/** Match `bytesN` (N = 1..32). Returns the byte size, or null if not. */
function parseFixedBytesSize(label: string): number | null {
  if (!label.startsWith("bytes")) return null;
  const rest = label.slice(5);
  if (!/^\d+$/.test(rest)) return null;
  const size = Number(rest);
  if (size < 1 || size > 32) return null;
  return size;
}

function decodeAddress(
  sliceHex: string,
  numberOfBytes: number,
): DecodedValue {
  // address is always 20 bytes; reject anything else as malformed.
  if (numberOfBytes !== 20) {
    return {
      kind: "unsupported",
      reason: `address has unexpected width ${numberOfBytes}`,
    };
  }
  return { kind: "address", address: getAddress(`0x${sliceHex}`) };
}

function decodeBool(sliceHex: string): DecodedValue {
  // Solidity sets bool to 0x01 for true, 0x00 for false. Any other
  // value is malformed storage (or a packed neighbor leaked in) — flag
  // it so the panel doesn't lie about a non-canonical state.
  if (sliceHex === "00") return { kind: "bool", value: false };
  if (sliceHex === "01") return { kind: "bool", value: true };
  return { kind: "unsupported", reason: `non-canonical bool byte 0x${sliceHex}` };
}

function decodeUint(
  sliceHex: string,
  numberOfBytes: number,
  bits = numberOfBytes * 8,
): DecodedValue {
  // sliceHex is guaranteed non-empty: decodeSlot rejects numberOfBytes ≤ 0.
  const value = BigInt(`0x${sliceHex}`);
  return { kind: "uint", value, bits };
}

function decodeInt(
  sliceHex: string,
  numberOfBytes: number,
  bits = numberOfBytes * 8,
): DecodedValue {
  const raw = BigInt(`0x${sliceHex}`);
  // Two's complement: if the high bit is set, the value is negative.
  // For an N-byte field, the high bit is 2^(N*8 - 1) and the modulus is 2^(N*8).
  const modulus = 1n << BigInt(numberOfBytes * 8);
  const signBit = 1n << BigInt(numberOfBytes * 8 - 1);
  const value = raw >= signBit ? raw - modulus : raw;
  return { kind: "int", value, bits };
}

function decodeFixedBytes(
  sliceHex: string,
  size: number,
): DecodedValue {
  return { kind: "bytes", hex: `0x${sliceHex}`, size };
}
