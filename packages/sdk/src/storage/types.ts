/**
 * Public types for the storage-slot decoder. The decoder is a pure
 * function from `(slot value, solc-style type info) → typed value`,
 * with no I/O — it never reads from chain, never fetches a layout,
 * never recurses through mapping keys. Higher layers (the API or UI)
 * do those lookups and call us per-entry.
 *
 * v1 scope is `inplace` encoding only — the type fits inside one
 * 32-byte slot (possibly packed with neighbors). Dynamic-length
 * encodings (`mapping`, `dynamic_array`, `bytes`/`string` storage)
 * need extra slot reads and stay raw at v1; the decoder reports them
 * as `unsupported` with the encoding name in the reason.
 */

/**
 * Decoded form of a single packed-slot variable. The discriminant is
 * `kind`; consumers should switch on it before reading the typed
 * fields. `unsupported` is returned for types we deliberately don't
 * decode at v1 — callers should fall through to displaying the raw
 * slot value.
 */
export type DecodedValue =
  /** EIP-55 checksummed address. Also returned for `contract` types. */
  | { kind: "address"; address: string }
  /** Unsigned integer of `bits` width (8/16/32/64/128/256). */
  | { kind: "uint"; value: bigint; bits: number }
  /** Two's-complement signed integer of `bits` width. */
  | { kind: "int"; value: bigint; bits: number }
  | { kind: "bool"; value: boolean }
  /** Fixed-width bytes (bytes1..bytes32). `size` is the declared width. */
  | { kind: "bytes"; hex: string; size: number }
  /** Type not handled at v1 — caller should display the raw slot value. */
  | { kind: "unsupported"; reason: string };

/**
 * Input to `decodeSlot`. Mirrors the fields needed from solc's
 * `StorageLayoutEntry` + `StorageLayoutType` so the decoder can stay
 * SDK-pure and avoid importing API types.
 */
export interface DecodeSlotInput {
  /** 0x-prefixed 32-byte hex (the on-chain slot value). */
  slotValue: string;
  /**
   * Solidity type label — e.g. `"uint256"`, `"address"`, `"bool"`,
   * `"bytes32"`. For `contract` types solc emits `"contract Foo"`
   * which we treat as address. For enums solc emits `"enum X.Y"`
   * which we treat as a small unsigned integer.
   */
  typeLabel: string;
  /**
   * Byte offset of this variable within the slot (0..31). solc packs
   * smaller types right-to-left, so multiple variables can share a
   * slot when their combined width ≤ 32 bytes.
   */
  offset: number;
  /** Declared width in bytes (1..32 for inplace types). */
  numberOfBytes: number;
}
