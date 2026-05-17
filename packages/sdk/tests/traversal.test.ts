import { describe, it, expect } from "vitest";
import {
  walkCallTree,
  flattenCallTree,
  filterByAddress,
  filterBySelector,
  findRevertFrame,
  buildGasProfile,
} from "../src/traversal/index.js";
import { addrs, makeFrame } from "./fixtures.js";
import type { TraceFrame } from "../src/types.js";

function tree(): TraceFrame {
  // root
  //  ├── child A (STATICCALL to VAULT)
  //  │     └── grandchild (CALL to BOB) — reverts
  //  └── child B (DELEGATECALL to CONTRACT)
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
        children: [
          makeFrame({
            type: "CALL",
            from: addrs.VAULT,
            to: addrs.BOB,
            gasUsed: 10_000n,
            input: "0xa9059cbb",
            error: "execution reverted",
            revertReason: "ERC20: insufficient balance",
            depth: 2,
          }),
        ],
      }),
      makeFrame({
        type: "DELEGATECALL",
        from: addrs.CONTRACT,
        to: addrs.CONTRACT,
        gasUsed: 20_000n,
        input: "0xa0712d68",
        depth: 1,
      }),
    ],
  });
}

describe("walkCallTree", () => {
  it("visits enter then exit in DFS order", () => {
    const order: string[] = [];
    walkCallTree(tree(), {
      enter: (f) => {
        order.push(`enter:${f.gasUsed}`);
      },
      exit: (f) => {
        order.push(`exit:${f.gasUsed}`);
      },
    });
    expect(order).toEqual([
      "enter:100000",
      "enter:30000",
      "enter:10000",
      "exit:10000",
      "exit:30000",
      "enter:20000",
      "exit:20000",
      "exit:100000",
    ]);
  });

  it("stops the walk when enter returns false", () => {
    const visited: bigint[] = [];
    walkCallTree(tree(), {
      enter: (f) => {
        visited.push(f.gasUsed);
        if (f.gasUsed === 30_000n) return false;
        return undefined;
      },
    });
    expect(visited).toEqual([100_000n, 30_000n]);
  });

  it("skips children when enter returns 'skip'", () => {
    const visited: bigint[] = [];
    walkCallTree(tree(), {
      enter: (f) => {
        visited.push(f.gasUsed);
        if (f.gasUsed === 30_000n) return "skip";
        return undefined;
      },
    });
    // grandchild (10000) is skipped; second branch (20000) still visited.
    expect(visited).toEqual([100_000n, 30_000n, 20_000n]);
  });

  it("does not blow the JS stack on pathologically deep trees", () => {
    // Build a 50_000-deep linear chain.
    let leaf: TraceFrame = makeFrame({ depth: 49_999 });
    for (let i = 49_998; i >= 0; i--) {
      leaf = makeFrame({ depth: i, children: [leaf] });
    }
    let count = 0;
    walkCallTree(leaf, {
      enter: () => {
        count++;
      },
    });
    expect(count).toBe(50_000);
  });
});

describe("flattenCallTree", () => {
  it("produces pre-order with depth + indices", () => {
    const flat = flattenCallTree(tree());
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 2, 1]);
    expect(flat.map((f) => f.preOrderIndex)).toEqual([0, 1, 2, 3]);
    expect(flat.map((f) => f.siblingIndex)).toEqual([0, 0, 0, 1]);
  });
});

describe("filterByAddress", () => {
  it("matches both `from` and `to` by default, case-insensitive", () => {
    const matches = filterByAddress(tree(), addrs.CONTRACT.toUpperCase() as typeof addrs.CONTRACT);
    // CONTRACT appears as `to` of root, `from` of both children, and self-DELEGATECALL.
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("respects matchTo: false", () => {
    const matches = filterByAddress(tree(), addrs.VAULT, { matchTo: false });
    expect(matches.map((m) => m.from)).toContain(addrs.VAULT);
  });
});

describe("filterBySelector", () => {
  it("matches frames by 4-byte calldata prefix", () => {
    const matches = filterBySelector(tree(), "0xa9059cbb");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.from).toBe(addrs.VAULT);
  });

  it("accepts selector without 0x prefix", () => {
    const matches = filterBySelector(tree(), "70a08231");
    expect(matches).toHaveLength(1);
  });

  it("throws on wrong-length selector", () => {
    expect(() => filterBySelector(tree(), "0x1234")).toThrow(/4 bytes/);
  });
});

describe("findRevertFrame", () => {
  it("returns the deepest reverting frame", () => {
    const reverted = findRevertFrame(tree());
    expect(reverted).not.toBeNull();
    expect(reverted!.revertReason).toBe("ERC20: insufficient balance");
    expect(reverted!.depth).toBe(2);
  });

  it("returns null when nothing reverted", () => {
    const ok = makeFrame({ children: [makeFrame({ depth: 1 })] });
    expect(findRevertFrame(ok)).toBeNull();
  });
});

describe("buildGasProfile", () => {
  it("computes selfGas by subtracting nested gas", () => {
    const profile = buildGasProfile(tree());
    expect(profile.totalGas).toBe(100_000n);
    // root selfGas = 100k - (30k + 20k) = 50k
    expect(profile.entries[0]!.selfGas).toBe(50_000n);
    // child A selfGas = 30k - 10k = 20k
    expect(profile.entries[0]!.children[0]!.selfGas).toBe(20_000n);
    // grandchild selfGas = 10k (leaf)
    expect(profile.entries[0]!.children[0]!.children[0]!.selfGas).toBe(10_000n);
  });

  it("computes percentages relative to root gasUsed", () => {
    const profile = buildGasProfile(tree());
    expect(profile.entries[0]!.percentage).toBe(100);
    expect(profile.entries[0]!.children[0]!.percentage).toBe(30);
    expect(profile.entries[0]!.children[1]!.percentage).toBe(20);
  });

  it("aggregates byCallType across all frames", () => {
    const profile = buildGasProfile(tree());
    // root CALL selfGas (50k) + grandchild CALL selfGas (10k) = 60k
    expect(profile.byCallType.CALL).toBe(60_000n);
    expect(profile.byCallType.STATICCALL).toBe(20_000n);
    expect(profile.byCallType.DELEGATECALL).toBe(20_000n);
  });

  it("returns zeroed percentages when root gasUsed is 0n", () => {
    const empty = makeFrame({ gasUsed: 0n });
    const profile = buildGasProfile(empty);
    expect(profile.totalGas).toBe(0n);
    expect(profile.entries[0]!.percentage).toBe(0);
  });

  it("clamps selfGas to 0n when children claim more gas than parent", () => {
    // Malformed trace: root says 5k but children sum to 30k.
    const weird = makeFrame({
      gasUsed: 5_000n,
      children: [makeFrame({ depth: 1, gasUsed: 30_000n })],
    });
    const profile = buildGasProfile(weird);
    expect(profile.entries[0]!.selfGas).toBe(0n);
  });

  it("uses frame.functionName when present in the GasProfileEntry", () => {
    const tree = makeFrame({
      gasUsed: 10_000n,
      functionName: "transfer(address,uint256)",
    });
    const profile = buildGasProfile(tree);
    expect(profile.entries[0]!.functionName).toBe("transfer(address,uint256)");
  });

  it("uses `from` as the entry address when `to` is null (CREATE frame)", () => {
    const tree = makeFrame({
      type: "CREATE",
      from: addrs.ALICE,
      to: null,
      gasUsed: 100_000n,
    });
    const profile = buildGasProfile(tree);
    expect(profile.entries[0]!.address).toBe(addrs.ALICE);
  });
});

describe("walkCallTree visitor optionality", () => {
  it("works with only an exit hook (no enter)", () => {
    const exits: bigint[] = [];
    walkCallTree(tree(), {
      exit: (f) => {
        exits.push(f.gasUsed);
      },
    });
    // Post-order: deepest first
    expect(exits).toEqual([10_000n, 30_000n, 20_000n, 100_000n]);
  });

  it("works with only an enter hook (no exit)", () => {
    const enters: bigint[] = [];
    walkCallTree(tree(), {
      enter: (f) => {
        enters.push(f.gasUsed);
      },
    });
    expect(enters).toEqual([100_000n, 30_000n, 10_000n, 20_000n]);
  });

  it("does nothing when no hooks are provided", () => {
    expect(() => walkCallTree(tree(), {})).not.toThrow();
  });
});

describe("walkCallTree exit early-termination", () => {
  it("stops the walk when exit returns false", () => {
    const visited: string[] = [];
    walkCallTree(tree(), {
      enter: (f) => {
        visited.push(`enter:${f.gasUsed}`);
      },
      exit: (f) => {
        visited.push(`exit:${f.gasUsed}`);
        if (f.gasUsed === 10_000n) return false;
        return undefined;
      },
    });
    // After exiting the 10_000n grandchild (which returned false), walk halts.
    // We should not see exit:30000 or anything later.
    expect(visited).toContain("exit:10000");
    expect(visited).not.toContain("exit:30000");
  });
});
