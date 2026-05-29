import { describe, it, expect } from "vitest";
import { decodeSlot } from "../src/storage/decodeSlot.js";
import type { DecodeSlotInput } from "../src/storage/types.js";

/**
 * 32-byte zero slot — handy base for "this byte alone is set" tests
 * where we want to isolate a single packed-slot variable.
 */
const ZERO_SLOT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/** Hex-pad `n` to 64 chars + 0x prefix (whole-slot value). */
const slot = (n: bigint): string =>
  `0x${n.toString(16).padStart(64, "0")}`;

describe("decodeSlot — input validation", () => {
  it("rejects a slot that isn't 0x + 64 hex chars", () => {
    expect(
      decodeSlot({
        slotValue: "0xdeadbeef",
        typeLabel: "uint256",
        offset: 0,
        numberOfBytes: 32,
      }),
    ).toEqual({
      kind: "unsupported",
      reason: "malformed slot value: 0xdeadbeef",
    });
  });

  it("rejects a slot missing the 0x prefix", () => {
    expect(
      decodeSlot({
        slotValue: "0".repeat(64),
        typeLabel: "uint256",
        offset: 0,
        numberOfBytes: 32,
      }).kind,
    ).toBe("unsupported");
  });

  it("rejects a negative offset", () => {
    expect(
      decodeSlot({
        slotValue: ZERO_SLOT,
        typeLabel: "uint8",
        offset: -1,
        numberOfBytes: 1,
      }),
    ).toEqual({
      kind: "unsupported",
      reason: "out-of-range slice (offset=-1, width=1)",
    });
  });

  it("rejects a zero/negative width", () => {
    expect(
      decodeSlot({
        slotValue: ZERO_SLOT,
        typeLabel: "uint8",
        offset: 0,
        numberOfBytes: 0,
      }).kind,
    ).toBe("unsupported");
  });

  it("rejects offset+width past the slot end", () => {
    expect(
      decodeSlot({
        slotValue: ZERO_SLOT,
        typeLabel: "uint256",
        offset: 1,
        numberOfBytes: 32,
      }).kind,
    ).toBe("unsupported");
  });
});

describe("decodeSlot — address", () => {
  it("decodes a 20-byte address and EIP-55 checksums it", () => {
    // lowercased "0xdeadbeef...feed" — getAddress() will mixed-case it.
    const input: DecodeSlotInput = {
      slotValue:
        "0x000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      typeLabel: "address",
      offset: 0,
      numberOfBytes: 20,
    };
    const result = decodeSlot(input);
    expect(result.kind).toBe("address");
    if (result.kind !== "address") throw new Error();
    expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result.address.toLowerCase()).toBe(
      "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    );
  });

  it("decodes `contract X` as address", () => {
    expect(
      decodeSlot({
        slotValue:
          "0x000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        typeLabel: "contract MyToken",
        offset: 0,
        numberOfBytes: 20,
      }).kind,
    ).toBe("address");
  });

  it("flags address with non-20 width as unsupported", () => {
    expect(
      decodeSlot({
        slotValue: ZERO_SLOT,
        typeLabel: "address",
        offset: 0,
        numberOfBytes: 12,
      }),
    ).toEqual({
      kind: "unsupported",
      reason: "address has unexpected width 12",
    });
  });
});

describe("decodeSlot — bool", () => {
  it("decodes 0x01 as true", () => {
    expect(
      decodeSlot({
        slotValue:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        typeLabel: "bool",
        offset: 0,
        numberOfBytes: 1,
      }),
    ).toEqual({ kind: "bool", value: true });
  });

  it("decodes 0x00 as false", () => {
    expect(
      decodeSlot({
        slotValue: ZERO_SLOT,
        typeLabel: "bool",
        offset: 0,
        numberOfBytes: 1,
      }),
    ).toEqual({ kind: "bool", value: false });
  });

  it("flags non-canonical bool bytes (0x02..0xff) as unsupported", () => {
    expect(
      decodeSlot({
        slotValue:
          "0x0000000000000000000000000000000000000000000000000000000000000002",
        typeLabel: "bool",
        offset: 0,
        numberOfBytes: 1,
      }),
    ).toEqual({
      kind: "unsupported",
      reason: "non-canonical bool byte 0x02",
    });
  });
});

describe("decodeSlot — uint", () => {
  it("decodes uint256 as the full slot value", () => {
    expect(
      decodeSlot({
        slotValue: slot(123456789n),
        typeLabel: "uint256",
        offset: 0,
        numberOfBytes: 32,
      }),
    ).toEqual({ kind: "uint", value: 123456789n, bits: 256 });
  });

  it("decodes bare `uint` as 256-bit", () => {
    const result = decodeSlot({
      slotValue: slot(1n),
      typeLabel: "uint",
      offset: 0,
      numberOfBytes: 32,
    });
    expect(result).toEqual({ kind: "uint", value: 1n, bits: 256 });
  });

  it("decodes a packed uint8 at the lowest byte", () => {
    // slot lowest byte = 0xab (171)
    expect(
      decodeSlot({
        slotValue:
          "0x00000000000000000000000000000000000000000000000000000000000000ab",
        typeLabel: "uint8",
        offset: 0,
        numberOfBytes: 1,
      }),
    ).toEqual({ kind: "uint", value: 171n, bits: 8 });
  });

  it("decodes a uint16 packed at offset 1", () => {
    // slot layout from the right: [..., 0x12 0x34, 0xff] — uint16 at offset 1
    // skips the rightmost byte and reads the next two.
    expect(
      decodeSlot({
        slotValue:
          "0x00000000000000000000000000000000000000000000000000000000001234ff",
        typeLabel: "uint16",
        offset: 1,
        numberOfBytes: 2,
      }),
    ).toEqual({ kind: "uint", value: 0x1234n, bits: 16 });
  });

  it("treats `enum X.Y` as a packed uint", () => {
    expect(
      decodeSlot({
        slotValue:
          "0x0000000000000000000000000000000000000000000000000000000000000003",
        typeLabel: "enum MyContract.State",
        offset: 0,
        numberOfBytes: 1,
      }),
    ).toEqual({ kind: "uint", value: 3n, bits: 8 });
  });
});

describe("decodeSlot — int (two's complement)", () => {
  it("decodes a positive int8", () => {
    expect(
      decodeSlot({
        slotValue:
          "0x000000000000000000000000000000000000000000000000000000000000007f",
        typeLabel: "int8",
        offset: 0,
        numberOfBytes: 1,
      }),
    ).toEqual({ kind: "int", value: 127n, bits: 8 });
  });

  it("decodes -1 (all bits set in width) as int8 = -1", () => {
    expect(
      decodeSlot({
        slotValue:
          "0x00000000000000000000000000000000000000000000000000000000000000ff",
        typeLabel: "int8",
        offset: 0,
        numberOfBytes: 1,
      }),
    ).toEqual({ kind: "int", value: -1n, bits: 8 });
  });

  it("decodes int8 minimum (0x80 → -128)", () => {
    expect(
      decodeSlot({
        slotValue:
          "0x0000000000000000000000000000000000000000000000000000000000000080",
        typeLabel: "int8",
        offset: 0,
        numberOfBytes: 1,
      }),
    ).toEqual({ kind: "int", value: -128n, bits: 8 });
  });

  it("decodes bare `int` (256-bit) as full-slot two's complement", () => {
    // All-0xff slot in 256-bit is -1.
    expect(
      decodeSlot({
        slotValue: `0x${"ff".repeat(32)}`,
        typeLabel: "int",
        offset: 0,
        numberOfBytes: 32,
      }),
    ).toEqual({ kind: "int", value: -1n, bits: 256 });
  });

  it("decodes int128 minimum", () => {
    // 0x80...00 in 16 bytes is -(2^127)
    expect(
      decodeSlot({
        slotValue: `0x${"0".repeat(32)}80${"0".repeat(30)}`,
        typeLabel: "int128",
        offset: 0,
        numberOfBytes: 16,
      }),
    ).toEqual({ kind: "int", value: -(1n << 127n), bits: 128 });
  });
});

describe("decodeSlot — bytes{1..32}", () => {
  it("decodes bytes32 as the full slot hex", () => {
    expect(
      decodeSlot({
        slotValue: `0x${"de".repeat(32)}`,
        typeLabel: "bytes32",
        offset: 0,
        numberOfBytes: 32,
      }),
    ).toEqual({ kind: "bytes", hex: `0x${"de".repeat(32)}`, size: 32 });
  });

  it("decodes bytes1 from a packed slot", () => {
    expect(
      decodeSlot({
        slotValue:
          "0x00000000000000000000000000000000000000000000000000000000000000ff",
        typeLabel: "bytes1",
        offset: 0,
        numberOfBytes: 1,
      }),
    ).toEqual({ kind: "bytes", hex: "0xff", size: 1 });
  });
});

describe("decodeSlot — unsupported labels", () => {
  it("flags mapping types as unsupported", () => {
    expect(
      decodeSlot({
        slotValue: ZERO_SLOT,
        typeLabel: "mapping(address => uint256)",
        offset: 0,
        numberOfBytes: 32,
      }),
    ).toEqual({
      kind: "unsupported",
      reason: "type not supported: mapping(address => uint256)",
    });
  });

  it("flags an unrecognized integer width", () => {
    // uint7 isn't a real Solidity type — should fall through as unsupported.
    expect(
      decodeSlot({
        slotValue: ZERO_SLOT,
        typeLabel: "uint7",
        offset: 0,
        numberOfBytes: 1,
      }).kind,
    ).toBe("unsupported");
  });

  it("flags integer types that don't match the digit pattern", () => {
    expect(
      decodeSlot({
        slotValue: ZERO_SLOT,
        typeLabel: "uintFoo",
        offset: 0,
        numberOfBytes: 1,
      }).kind,
    ).toBe("unsupported");
  });

  it("flags bytes types with a non-numeric suffix", () => {
    expect(
      decodeSlot({
        slotValue: ZERO_SLOT,
        typeLabel: "bytesFoo",
        offset: 0,
        numberOfBytes: 1,
      }).kind,
    ).toBe("unsupported");
  });

  it("flags bytes33 (out of range) as unsupported", () => {
    expect(
      decodeSlot({
        slotValue: ZERO_SLOT,
        typeLabel: "bytes33",
        offset: 0,
        numberOfBytes: 32,
      }).kind,
    ).toBe("unsupported");
  });

  it("flags bytes0 as unsupported", () => {
    expect(
      decodeSlot({
        slotValue: ZERO_SLOT,
        typeLabel: "bytes0",
        offset: 0,
        numberOfBytes: 0,
      }).kind,
    ).toBe("unsupported");
  });

  it("flags out-of-range uint widths", () => {
    expect(
      decodeSlot({
        slotValue: ZERO_SLOT,
        typeLabel: "uint264",
        offset: 0,
        numberOfBytes: 32,
      }).kind,
    ).toBe("unsupported");
  });
});
