import { decodeSlot, type DecodedValue } from "@valve-tech/trace-sdk";

/**
 * Web-side glue between the SDK's pure `decodeSlot` and the layout
 * shape that `/api/source/:address/storage-layout` returns.
 *
 * The decoder works per-(slot value, type info). solc emits a
 * `StorageLayout` with two pieces: a `storage` array of variable
 * entries (each pointing at a slot) and a `types` registry mapping
 * type strings to type metadata (encoding, width, label). To decode a
 * state-diff row, we:
 *
 *   1. Build a `Map<slot, entries[]>` from `inplace`-encoded layout
 *      entries — multiple variables can share a slot (packing).
 *   2. For each state-diff `StorageChange.slot`, look it up in the map.
 *   3. If found, decode each packed variable from both `before` and
 *      `after` slot values; otherwise return `null` and the panel
 *      falls back to raw hex.
 *
 * Mappings and dynamic arrays produce slot hashes that don't reverse to
 * a base slot, so they always fall back to raw — exactly the gap the
 * decoder declares in its `unsupported` branch.
 */

export interface StorageLayoutEntry {
  label: string;
  slot: string;
  offset: number;
  type: string;
  contract: string;
}

export interface StorageType {
  encoding: string;
  numberOfBytes: string;
  label: string;
}

export interface StorageLayout {
  storage: StorageLayoutEntry[];
  types: Record<string, StorageType>;
}

export interface DecodedRow {
  entry: StorageLayoutEntry;
  type: StorageType;
  before: DecodedValue;
  after: DecodedValue;
}

/**
 * Normalize a slot identifier to 0x + 64 lowercase hex chars. solc
 * emits slot numbers as decimal strings; prestate diffs emit them as
 * `0x`-prefixed hex of varying widths. We need both to live in the
 * same Map.
 */
function normalizeSlot(raw: string): string {
  const stripped = raw.startsWith("0x") || raw.startsWith("0X")
    ? raw.slice(2)
    : BigInt(raw).toString(16);
  return `0x${stripped.toLowerCase().padStart(64, "0")}`;
}

/**
 * Build a slot → entries index from the inplace portion of a layout.
 * Mapping and dynamic-array entries are skipped because their base
 * slot doesn't match the hashed slot a state diff reports.
 */
export function buildSlotIndex(
  layout: StorageLayout,
): Map<string, Array<{ entry: StorageLayoutEntry; type: StorageType }>> {
  const idx = new Map<
    string,
    Array<{ entry: StorageLayoutEntry; type: StorageType }>
  >();
  for (const entry of layout.storage) {
    const type = layout.types[entry.type];
    if (!type || type.encoding !== "inplace") continue;
    const key = normalizeSlot(entry.slot);
    const bucket = idx.get(key) ?? [];
    bucket.push({ entry, type });
    idx.set(key, bucket);
  }
  return idx;
}

/**
 * Decode all packed variables at one slot from before/after values.
 * Returns null when the slot isn't in the layout (mapping/array
 * hashes, or a contract whose layout we don't have).
 */
export function decodeChangeAtSlot(
  index: Map<
    string,
    Array<{ entry: StorageLayoutEntry; type: StorageType }>
  >,
  slot: string,
  before: string,
  after: string,
): DecodedRow[] | null {
  const entries = index.get(normalizeSlot(slot));
  if (!entries || entries.length === 0) return null;

  return entries.map(({ entry, type }) => ({
    entry,
    type,
    before: decodeSlot({
      slotValue: before,
      typeLabel: type.label,
      offset: entry.offset,
      numberOfBytes: Number.parseInt(type.numberOfBytes, 10),
    }),
    after: decodeSlot({
      slotValue: after,
      typeLabel: type.label,
      offset: entry.offset,
      numberOfBytes: Number.parseInt(type.numberOfBytes, 10),
    }),
  }));
}

/**
 * Render a `DecodedValue` as a short, human-readable string for inline
 * display in the panel. Returns `null` for `unsupported` so callers can
 * fall back to the raw hex without rendering an "unknown" placeholder.
 */
export function formatDecodedValue(value: DecodedValue): string | null {
  switch (value.kind) {
    case "address":
      return value.address;
    case "bool":
      return value.value ? "true" : "false";
    case "uint":
    case "int":
      return value.value.toLocaleString();
    case "bytes":
      return value.hex;
    case "unsupported":
      return null;
  }
}
