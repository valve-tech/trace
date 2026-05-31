import { encodePacked, keccak256, pad, toHex } from "viem";
import type { StorageEntry, StorageType } from "./types";

/**
 * Pure slot-computation helpers — Solidity's storage layout rules
 * translated to viem calls. Spec reference:
 * https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html
 *
 * These are extracted from StorageLayoutViewer so they can be exercised
 * with known test vectors. A wrong-by-one byte here means the viewer
 * silently reads the wrong slot on-chain, which the user has no way to
 * detect without recomputing by hand.
 */

/**
 * For `mapping(K => V) m` declared at storage slot `s`, the value for
 * key `k` lives at `keccak256(abi.encode(k, s))`. Value-type keys are
 * left-padded to 32 bytes. We use `encodePacked(["bytes32","bytes32"])`
 * after pre-padding both inputs, which is byte-equivalent to abi.encode
 * for two value-type 32-byte inputs.
 *
 * @param baseSlot decimal-string slot of the mapping declaration
 * @param key hex-string key, already 0x-prefixed
 */
export function computeMappingSlot(baseSlot: string, key: string): string {
  const slotPadded = pad(toHex(BigInt(baseSlot)), { size: 32 });
  const keyPadded = pad(key as `0x${string}`, { size: 32 });
  return keccak256(
    encodePacked(["bytes32", "bytes32"], [keyPadded, slotPadded]),
  );
}

/**
 * For `T[] a` at storage slot `s`, element data starts at
 * `keccak256(s)`. Each element takes `ceil(sizeof(T) / 32)` slots, so
 * element `i` lives at `keccak256(s) + i * ceil(sizeof(T)/32)`.
 *
 * @param baseSlot decimal-string slot of the array declaration
 * @param index zero-based element index
 * @param elementSize decimal byte size of one element (solc's `numberOfBytes`)
 */
export function computeArraySlot(
  baseSlot: string,
  index: number,
  elementSize: number,
): string {
  const arrayDataSlot = keccak256(pad(toHex(BigInt(baseSlot)), { size: 32 }));
  const offset = BigInt(index) * BigInt(Math.ceil(elementSize / 32));
  return toHex(BigInt(arrayDataSlot) + offset);
}

/**
 * Resolve the storage slot to read for a given (entry, type, user-input)
 * combination, dispatching on the type's encoding. Returns null when the
 * encoding requires a key/index and `rawKey` is empty or unparseable —
 * the caller treats that as "no slot to read yet".
 *
 * Simple (`inplace` / `bytes` / anything that isn't mapping or array)
 * variables don't need a key; the slot is the declared base slot,
 * 32-byte padded.
 *
 * Mapping keys may be given as `0x...` hex (used as-is) or as a decimal
 * uint string (converted via BigInt → padded hex).
 */
export function resolveSlot(
  entry: StorageEntry,
  typeInfo: StorageType | undefined,
  rawKey: string,
): string | null {
  if (!typeInfo) return null;

  if (typeInfo.encoding === "mapping") {
    if (!rawKey) return null;
    const keyHex = rawKey.startsWith("0x")
      ? rawKey
      : pad(toHex(BigInt(rawKey)), { size: 32 });
    return computeMappingSlot(entry.slot, keyHex);
  }

  if (typeInfo.encoding === "dynamic_array") {
    const index = parseInt(rawKey, 10);
    if (!Number.isFinite(index)) return null;
    const elemSize = parseInt(typeInfo.numberOfBytes, 10);
    return computeArraySlot(entry.slot, index, elemSize);
  }

  return pad(toHex(BigInt(entry.slot)), { size: 32 });
}
