import { describe, it, expect } from "vitest";
import {
  adjustBrightness,
  buildFlamegraphLayout,
  getBarColor,
} from "../../src/components/flamegraphLayout.js";
import { addrs, makeFrame } from "../fixtures.js";

describe("adjustBrightness", () => {
  it("adds amount to each channel and returns rgb()", () => {
    expect(adjustBrightness("#000000", 10)).toBe("rgb(10, 10, 10)");
  });

  it("clamps to 255 (saturation)", () => {
    expect(adjustBrightness("#ffffff", 100)).toBe("rgb(255, 255, 255)");
  });

  it("clamps to 0 (negative amount)", () => {
    expect(adjustBrightness("#0a0a0a", -100)).toBe("rgb(0, 0, 0)");
  });

  it("handles mid-range correctly", () => {
    expect(adjustBrightness("#80c0ff", 5)).toBe("rgb(133, 197, 255)");
  });
});

describe("getBarColor", () => {
  it("uses the call-type's color at even depths (no brightness shift)", () => {
    expect(getBarColor("CALL", 0)).toBe("rgb(99, 102, 241)");
  });

  it("lightens at odd depths for visual separation", () => {
    const even = getBarColor("CALL", 0);
    const odd = getBarColor("CALL", 1);
    expect(odd).not.toBe(even);
  });

  it("returns a stable color for every CallType in the union", () => {
    const types = [
      "CALL",
      "STATICCALL",
      "DELEGATECALL",
      "CALLCODE",
      "CREATE",
      "CREATE2",
      "SELFDESTRUCT",
    ] as const;
    for (const t of types) {
      expect(getBarColor(t, 0)).toMatch(/^rgb\(/);
    }
  });

  it("falls back to neutral for an unknown call type (defensive)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getBarColor("FUTURE_OPCODE" as any, 0)).toMatch(/^rgb\(/);
  });
});

describe("buildFlamegraphLayout", () => {
  function tree() {
    return makeFrame({
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gasUsed: 100_000n,
      input: "0xdeadbeef",
      children: [
        makeFrame({
          type: "STATICCALL",
          from: addrs.CONTRACT,
          to: addrs.VAULT,
          gasUsed: 30_000n,
          input: "0x70a08231",
          depth: 1,
        }),
        makeFrame({
          type: "DELEGATECALL",
          from: addrs.CONTRACT,
          to: addrs.BOB,
          gasUsed: 20_000n,
          input: "0xa9059cbb",
          depth: 1,
        }),
      ],
    });
  }

  it("returns one bar per frame in pre-order", () => {
    const bars = buildFlamegraphLayout(tree());
    expect(bars).toHaveLength(3);
    expect(bars[0]!.frame.type).toBe("CALL");
    expect(bars[1]!.frame.type).toBe("STATICCALL");
    expect(bars[2]!.frame.type).toBe("DELEGATECALL");
  });

  it("assigns the root to 100% width starting at 0", () => {
    const bars = buildFlamegraphLayout(tree());
    expect(bars[0]!.startGas).toBe(0);
    expect(bars[0]!.width).toBe(100);
  });

  it("lays out siblings sequentially with correct percentage widths", () => {
    const bars = buildFlamegraphLayout(tree());
    // STATICCALL is 30k of 100k = 30%, starting at 0
    expect(bars[1]!.startGas).toBe(0);
    expect(bars[1]!.width).toBe(30);
    // DELEGATECALL is 20k of 100k = 20%, starting at 30
    expect(bars[2]!.startGas).toBe(30);
    expect(bars[2]!.width).toBe(20);
  });

  it("assigns depths matching the tree", () => {
    const bars = buildFlamegraphLayout(tree());
    expect(bars[0]!.depth).toBe(0);
    expect(bars[1]!.depth).toBe(1);
    expect(bars[2]!.depth).toBe(1);
  });

  it("uses frame.functionName when available", () => {
    const t = makeFrame({
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      functionName: "transfer(address,uint256)",
      input: "0xa9059cbb",
    });
    const bars = buildFlamegraphLayout(t);
    expect(bars[0]!.label).toBe("transfer(address,uint256)");
  });

  it("calls resolveSelector when functionName is missing", () => {
    const t = makeFrame({
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      input: "0xa9059cbb",
    });
    const bars = buildFlamegraphLayout(t, {
      resolveSelector: (sel) => (sel === "0xa9059cbb" ? "transfer" : undefined),
    });
    expect(bars[0]!.label).toBe("transfer");
  });

  it("falls back to the selector when resolveSelector returns undefined", () => {
    const t = makeFrame({
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      input: "0xa9059cbb",
    });
    const bars = buildFlamegraphLayout(t, { resolveSelector: () => undefined });
    expect(bars[0]!.label).toBe("0xa9059cbb");
  });

  it("falls back to the call type for empty calldata (fallback function)", () => {
    const t = makeFrame({
      type: "STATICCALL",
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      input: "0x",
    });
    const bars = buildFlamegraphLayout(t);
    expect(bars[0]!.label).toBe("STATICCALL");
  });

  it("handles a tree with totalGas of 0n without dividing by zero", () => {
    const t = makeFrame({
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gasUsed: 0n,
    });
    expect(() => buildFlamegraphLayout(t)).not.toThrow();
  });

  it("colors bars per call type", () => {
    const bars = buildFlamegraphLayout(tree());
    expect(bars[0]!.color).toBe(getBarColor("CALL", 0));
    expect(bars[1]!.color).toBe(getBarColor("STATICCALL", 1));
  });
});
