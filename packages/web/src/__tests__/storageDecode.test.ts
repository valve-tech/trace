import { describe, it, expect } from "vitest";
import {
  buildSlotIndex,
  decodeChangeAtSlot,
  formatDecodedValue,
  type StorageLayout,
} from "../lib/storageDecode";

// ---------- buildSlotIndex ----------

describe("buildSlotIndex", () => {
  it("skips entries whose type encoding is not inplace", () => {
    const layout: StorageLayout = {
      storage: [
        {
          label: "owners",
          slot: "0",
          offset: 0,
          type: "t_mapping",
          contract: "C",
        },
        {
          label: "values",
          slot: "1",
          offset: 0,
          type: "t_array",
          contract: "C",
        },
      ],
      types: {
        t_mapping: { encoding: "mapping", numberOfBytes: "32", label: "mapping(address => uint256)" },
        t_array: { encoding: "dynamic_array", numberOfBytes: "32", label: "uint256[]" },
      },
    };
    expect(buildSlotIndex(layout).size).toBe(0);
  });

  it("skips entries whose type metadata is missing", () => {
    const layout: StorageLayout = {
      storage: [
        { label: "x", slot: "0", offset: 0, type: "t_missing", contract: "C" },
      ],
      types: {},
    };
    expect(buildSlotIndex(layout).size).toBe(0);
  });

  it("packs multiple entries that share a slot into one bucket", () => {
    const layout: StorageLayout = {
      storage: [
        { label: "a", slot: "5", offset: 0, type: "t_bool", contract: "C" },
        { label: "b", slot: "5", offset: 1, type: "t_uint8", contract: "C" },
      ],
      types: {
        t_bool: { encoding: "inplace", numberOfBytes: "1", label: "bool" },
        t_uint8: { encoding: "inplace", numberOfBytes: "1", label: "uint8" },
      },
    };
    const idx = buildSlotIndex(layout);
    const key = `0x${"0".repeat(63)}5`;
    expect(idx.size).toBe(1);
    const bucket = idx.get(key);
    expect(bucket).toBeDefined();
    expect(bucket).toHaveLength(2);
    expect(bucket!.map((b) => b.entry.label)).toEqual(["a", "b"]);
  });

  it("keys entries by normalized 0x + 64 lowercase hex regardless of input format", () => {
    const layout: StorageLayout = {
      storage: [
        // decimal slot
        { label: "a", slot: "10", offset: 0, type: "t_u", contract: "C" },
        // hex slot with mixed case + uppercase 0X prefix should normalize to same key
        { label: "b", slot: "0X000A", offset: 0, type: "t_u", contract: "C" },
      ],
      types: {
        t_u: { encoding: "inplace", numberOfBytes: "32", label: "uint256" },
      },
    };
    const idx = buildSlotIndex(layout);
    const key = `0x${"0".repeat(62)}0a`;
    expect([...idx.keys()]).toEqual([key]);
    expect(idx.get(key)).toHaveLength(2);
    // Key must be lowercase 0x + 64 hex chars
    expect(key).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

// ---------- decodeChangeAtSlot ----------

describe("decodeChangeAtSlot", () => {
  const layout: StorageLayout = {
    storage: [
      { label: "n", slot: "0", offset: 0, type: "t_u256", contract: "C" },
      // packed pair at slot 1: bool a (offset 0, 1 byte), uint8 b (offset 1, 1 byte)
      { label: "a", slot: "1", offset: 0, type: "t_bool", contract: "C" },
      { label: "b", slot: "1", offset: 1, type: "t_uint8", contract: "C" },
    ],
    types: {
      t_u256: { encoding: "inplace", numberOfBytes: "32", label: "uint256" },
      t_bool: { encoding: "inplace", numberOfBytes: "1", label: "bool" },
      t_uint8: { encoding: "inplace", numberOfBytes: "1", label: "uint8" },
    },
  };
  const index = buildSlotIndex(layout);

  it("returns null when the slot is not in the index", () => {
    const slot = `0x${"0".repeat(63)}9`;
    const zero = `0x${"0".repeat(64)}`;
    expect(decodeChangeAtSlot(index, slot, zero, zero)).toBeNull();
  });

  it("returns one DecodedRow per entry at a single-variable slot", () => {
    const slot0 = `0x${"0".repeat(64)}`;
    const before = `0x${"0".repeat(64)}`;
    // uint256 value = 1
    const after = `0x${"0".repeat(63)}1`;
    const rows = decodeChangeAtSlot(index, slot0, before, after);
    if (rows === null) throw new Error("expected rows");
    expect(rows).toHaveLength(1);
    const [row] = rows;
    if (!row) throw new Error("expected first row");
    expect(row.entry.label).toBe("n");
    expect(row.before).toEqual({ kind: "uint", value: 0n, bits: 256 });
    expect(row.after).toEqual({ kind: "uint", value: 1n, bits: 256 });
  });

  it("returns one DecodedRow per packed entry at a shared slot", () => {
    const slot1 = `0x${"0".repeat(63)}1`;
    // before: a=false (byte 0 = 00), b=0 (byte 1 = 00)
    const before = `0x${"0".repeat(64)}`;
    // after: a=true (byte 0 = 01), b=2 (byte 1 = 02) → last 4 nibbles = "0201"
    const after = `0x${"0".repeat(60)}0201`;
    const rows = decodeChangeAtSlot(index, slot1, before, after);
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(2);

    const a = rows!.find((r) => r.entry.label === "a")!;
    const b = rows!.find((r) => r.entry.label === "b")!;
    expect(a.before).toEqual({ kind: "bool", value: false });
    expect(a.after).toEqual({ kind: "bool", value: true });
    expect(b.before).toEqual({ kind: "uint", value: 0n, bits: 8 });
    expect(b.after).toEqual({ kind: "uint", value: 2n, bits: 8 });
  });

  it("normalizes the lookup slot the same way as the index keys", () => {
    // Pass decimal "1" rather than 0x-padded — should still hit the bucket.
    const before = `0x${"0".repeat(64)}`;
    const after = `0x${"0".repeat(64)}`;
    const rows = decodeChangeAtSlot(index, "1", before, after);
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(2);
  });
});

// ---------- formatDecodedValue ----------

describe("formatDecodedValue", () => {
  it("formats an address as-is", () => {
    const addr = "0x000000000000000000000000000000000000dEaD";
    expect(formatDecodedValue({ kind: "address", address: addr })).toBe(addr);
  });

  it("formats bools as 'true' / 'false'", () => {
    expect(formatDecodedValue({ kind: "bool", value: true })).toBe("true");
    expect(formatDecodedValue({ kind: "bool", value: false })).toBe("false");
  });

  it("formats uint with locale separators", () => {
    expect(
      formatDecodedValue({ kind: "uint", value: 1234567n, bits: 256 }),
    ).toBe((1234567n).toLocaleString());
  });

  it("formats int with locale separators (negative)", () => {
    expect(formatDecodedValue({ kind: "int", value: -42n, bits: 64 })).toBe(
      (-42n).toLocaleString(),
    );
  });

  it("formats bytes as the hex field", () => {
    expect(
      formatDecodedValue({ kind: "bytes", hex: "0xdeadbeef", size: 4 }),
    ).toBe("0xdeadbeef");
  });

  it("returns null for unsupported so callers fall back to raw hex", () => {
    expect(
      formatDecodedValue({ kind: "unsupported", reason: "nope" }),
    ).toBeNull();
  });
});
