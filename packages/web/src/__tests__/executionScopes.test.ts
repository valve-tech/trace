import { describe, it, expect } from "vitest";
import {
  buildExecutionTree,
  filterExecutionTree,
  computePcsByContract,
  type ExecNode,
} from "../components/debugger/StepDebugger/executionScopes";
import type { OpcodeStep, CallFrame } from "../api/debugger";
import type { SourceLocation } from "../api/source";

function step(pc: number, depth: number, op = "JUMP"): OpcodeStep {
  return { pc, op, gas: 0, gasCost: 0, depth, stack: [], memory: [], storage: {} };
}
function loc(jumpType: string, snippet: string, line = 0): SourceLocation {
  return { file: "C.sol", line, column: 0, endLine: line, endColumn: 0, sourceSnippet: snippet, jumpType };
}
function frame(to: string, calls: CallFrame[] = []): CallFrame {
  return { type: "CALL", from: "0x0", to, gas: "0x0", gasUsed: "0x0", input: "0x", calls } as CallFrame;
}
const kids = (n: ExecNode): ExecNode[] => (n.kind === "log" || n.kind === "op" ? [] : n.children);
const fns = (n: ExecNode) => kids(n).filter((c) => c.kind === "fn") as Extract<ExecNode, { kind: "fn" }>[];
const calls = (n: ExecNode) => kids(n).filter((c) => c.kind === "call") as Extract<ExecNode, { kind: "call" }>[];
const logs = (n: ExecNode) => kids(n).filter((c) => c.kind === "log") as Extract<ExecNode, { kind: "log" }>[];

describe("buildExecutionTree", () => {
  it("nests internal functions via jump i/o", () => {
    const root = frame("0xAAA");
    const steps = [step(0, 1), step(10, 1), step(20, 1), step(30, 1), step(40, 1)];
    const maps = {
      "0xaaa": {
        10: loc("i", "transferFrom(...)", 540),
        20: loc("i", "_transferFrom(a, b)", 544),
        30: loc("o", ""),
        40: loc("o", ""),
      } as Record<number, SourceLocation>,
    };
    const tree = buildExecutionTree(root, new Map([[root, 0]]), steps, maps);
    const top = fns(tree);
    expect(top).toHaveLength(1);
    expect(top[0]!.name).toBe("transferFrom");
    expect(fns(top[0]!)[0]!.name).toBe("_transferFrom"); // nested inside transferFrom
    // dispatchStep = the first internal jump's landing step index (where a row
    // click navigates): the 'i' at step 1 lands on step 2.
    expect(tree.kind === "call" ? tree.dispatchStep : null).toBe(2);
  });

  it("names an internal fn from its definition snippet, not the call-site cast", () => {
    const root = frame("0xAAA");
    const steps = [step(0, 1), step(10, 1), step(20, 1), step(30, 1)];
    const maps = {
      "0xaaa": {
        // Call site reads like a cast — the old call-site heuristic named this
        // "IERC20"; the entry JUMPDEST maps to the real FunctionDefinition.
        10: loc("i", "IERC20(token).balanceOf(addr)", 100),
        20: loc("-", "function balanceOf(address account) public view returns (uint256)", 200),
        30: loc("o", ""),
      } as Record<number, SourceLocation>,
    };
    const tree = buildExecutionTree(root, new Map([[root, 0]]), steps, maps);
    expect(fns(tree)[0]!.name).toBe("balanceOf");
  });

  it("names an unnamed receive()/fallback from its definition snippet", () => {
    const root = frame("0xAAA");
    const steps = [step(0, 1), step(10, 1), step(20, 1), step(30, 1)];
    const maps = {
      "0xaaa": {
        10: loc("i", "to.call{value: amt}('')", 50),
        20: loc("-", "receive() external payable {", 80),
        30: loc("o", ""),
      } as Record<number, SourceLocation>,
    };
    const tree = buildExecutionTree(root, new Map([[root, 0]]), steps, maps);
    expect(fns(tree)[0]!.name).toBe("receive");
  });

  it("hoists the public-dispatch wrapper so internal calls sit under the frame", () => {
    const root = frame("0xAAA");
    const steps = [step(0, 1), step(10, 1), step(11, 1), step(20, 1), step(30, 1)];
    const maps = {
      "0xaaa": {
        10: loc("i", "function transferFrom(...)", 540), // public dispatch (decl)
        11: loc("i", "function transferFrom(...)", 540), // duplicate entry
        20: loc("i", "_transferFrom(a)", 544), // real internal call
        30: loc("o", ""),
      } as Record<number, SourceLocation>,
    };
    const tree = buildExecutionTree(root, new Map([[root, 0]]), steps, maps);
    // The `function transferFrom` wrappers are hoisted away; _transferFrom is a
    // direct child of the frame.
    const top = fns(tree);
    expect(top).toHaveLength(1);
    expect(top[0]!.name).toBe("_transferFrom");
  });

  it("nests an external sub-call inside the internal function that made it", () => {
    const child = frame("0xBBB");
    const root = frame("0xAAA", [child]);
    // depth-1 root: enter swapBack at step1, CALL into child at step2 (depth 2 entry at 3)
    const steps = [step(0, 1), step(10, 1), step(99, 1, "CALL"), step(0, 2), step(11, 1)];
    const maps = { "0xaaa": { 10: loc("i", "swapBack()", 616) } as Record<number, SourceLocation> };
    const tree = buildExecutionTree(
      root,
      new Map([[root, 0], [child, 3]]),
      steps,
      maps,
    );
    const swapBack = fns(tree)[0]!;
    expect(swapBack.name).toBe("swapBack");
    // the external call to 0xBBB nests INSIDE swapBack, not as a sibling
    expect(calls(swapBack)).toHaveLength(1);
    expect(calls(swapBack)[0]!.frame.to).toBe("0xBBB");
    expect(calls(tree)).toHaveLength(0);
  });

  it("closes a scope by containment when the return has no 'o' marker", () => {
    // F1 (body lines 100-200) calls F2 (body 300-310); F2 returns with NO 'o'
    // marker (optimizer shared the return block); execution resumes in F1 at
    // line 160 and emits a log. The log must land in F1, not the stale F2.
    const root = frame("0xAAA");
    const L = (line: number, end: number, jump: string, snip: string): SourceLocation => ({
      file: "C.sol", line, column: 0, endLine: end, endColumn: 0, sourceSnippet: snip, jumpType: jump,
    });
    const steps = [
      step(0, 1), step(10, 1), step(11, 1), step(12, 1), step(13, 1), step(14, 1, "LOG1"), step(15, 1),
    ];
    const maps = {
      "0xaaa": {
        10: L(50, 50, "i", "f1()"), // enter F1 from the dispatch
        11: L(100, 200, "-", "function f1() {"), // F1 body range
        12: L(150, 150, "i", "f2()"), // F1 calls F2 (call site inside F1)
        13: L(300, 310, "-", "function f2() {"), // F2 body range (disjoint)
        14: L(160, 160, "-", "emit E()"), // back in F1 — F2 returned, no 'o'
      } as Record<number, SourceLocation>,
    };
    const logsByStep = new Map([[5, { name: "E()", topicCount: 1 }]]);
    const tree = buildExecutionTree(root, new Map([[root, 0]]), steps, maps, logsByStep);
    const f1 = fns(tree)[0]!;
    expect(f1.name).toBe("f1");
    expect(fns(f1)[0]!.name).toBe("f2"); // F2 nested inside F1
    expect(logs(f1).map((l) => l.name)).toContain("E()"); // log closed back into F1
  });

  it("places a LOG opcode as an event leaf inside the open function scope", () => {
    const root = frame("0xAAA");
    // enter swapBack at step1, emit a LOG3 at step2 (own depth), still inside it
    const steps = [step(0, 1), step(10, 1), step(20, 1, "LOG3"), step(30, 1)];
    const maps = { "0xaaa": { 10: loc("i", "swapBack()", 616) } as Record<number, SourceLocation> };
    const logsByStep = new Map([[2, { name: "AutoLiquify(uint256,uint256)", topicCount: 3 }]]);
    const tree = buildExecutionTree(root, new Map([[root, 0]]), steps, maps, logsByStep);
    const swapBack = fns(tree)[0]!;
    expect(logs(swapBack)).toHaveLength(1);
    expect(logs(swapBack)[0]!.name).toBe("AutoLiquify(uint256,uint256)");
    expect(logs(swapBack)[0]!.step).toBe(2);
  });

  it("treats a codeless callee as a leaf (no recursion into parent's code)", () => {
    const child = frame("0xBBB"); // value transfer, runs no code
    const root = frame("0xAAA", [child]);
    // child mapped to the CALL op at the parent's depth (step 1); never goes deeper
    const steps = [step(0, 1), step(99, 1, "CALL"), step(11, 1), step(12, 1)];
    const tree = buildExecutionTree(root, new Map([[root, 0], [child, 1]]), steps, {});
    const leaf = calls(tree)[0]!;
    expect(leaf.frame.to).toBe("0xBBB");
    expect(leaf.children).toHaveLength(0);
  });

  it("call-site name overrides fnIndex when they disagree AND the call-site fn is known", () => {
    // The classic library-trampoline case. The contract's `appId()`
    // calls `getStorageBytes32(name)`, but the optimizer-shared
    // JUMPDEST source map points back to a line inside `getStorageBool`
    // (the first storage getter in the library). Without the override,
    // fnIndex's enclosing-line lookup would return "getStorageBool";
    // the override trusts the call site, which names the actual
    // function being entered.
    const root = frame("0xLIB");
    const steps = [
      step(0, 1),
      step(10, 1), // the JUMP `i` — source map points to the call expr
      step(20, 1), // landing — source map points inside getStorageBool
      step(30, 1),
    ];
    const L = (
      line: number,
      end: number,
      jump: string,
      snip: string,
    ): SourceLocation => ({
      file: "Lib.sol",
      line,
      column: 0,
      endLine: end,
      endColumn: 0,
      sourceSnippet: snip,
      jumpType: jump,
    });
    const maps = {
      "0xlib": {
        // appId()'s call expression: explicitly invokes getStorageBytes32
        10: L(50, 50, "i", "getStorageBytes32(name)"),
        // Landing maps into the body of getStorageBool (the bug: shared trampoline)
        20: L(12, 60, "-", "bytes32 location = getStorageLocation(name);"),
      } as Record<number, SourceLocation>,
    };
    // The library source has both functions; getStorageBool comes FIRST
    // so the enclosing-line lookup would return it for any landing
    // between its decl line (10) and getStorageBytes32's decl line (30).
    const sourcesByAddr = {
      "0xlib": [
        {
          name: "Lib.sol",
          content: [
            "library Storage {",
            "  function getStorageLocation(bytes32 name) internal pure returns (bytes32) {",
            "    return keccak256(abi.encodePacked('storage.', name));",
            "  }",
            "",
            "",
            "",
            "",
            "",
            "  function getStorageBool(bytes32 name) internal view returns (bool) {",
            "    bytes32 location = getStorageLocation(name);",
            "    bool value;",
            "    assembly { value := sload(location) }",
            "    return value;",
            "  }",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "  function getStorageBytes32(bytes32 name) internal view returns (bytes32) {",
            "    bytes32 location = getStorageLocation(name);",
            "    bytes32 value;",
            "    assembly { value := sload(location) }",
            "    return value;",
            "  }",
            "}",
          ].join("\n"),
        },
      ],
    };
    const tree = buildExecutionTree(
      root,
      new Map([[root, 0]]),
      steps,
      maps,
      undefined,
      undefined,
      sourcesByAddr,
    );
    // Without the override this would be "getStorageBool" (the enclosing
    // fn for line 12). With the override, the call site wins and we get
    // "getStorageBytes32" — the function actually being entered.
    const top = fns(tree);
    expect(top).toHaveLength(1);
    expect(top[0]!.name).toBe("getStorageBytes32");
  });

  it("call-site override does NOT fire when the call-site name isn't a known fn", () => {
    // Defensive: if the call-site snippet names something that isn't a
    // function in the source (e.g. a type cast, a library prefix), the
    // override is a no-op and the fnIndex classification stands. This
    // prevents the heuristic from wrongly rewriting legitimate
    // resolutions.
    const root = frame("0xAAA");
    const steps = [step(0, 1), step(10, 1), step(20, 1), step(30, 1)];
    const L = (
      line: number,
      end: number,
      jump: string,
      snip: string,
    ): SourceLocation => ({
      file: "C.sol",
      line,
      column: 0,
      endLine: end,
      endColumn: 0,
      sourceSnippet: snip,
      jumpType: jump,
    });
    const maps = {
      "0xaaa": {
        // Cast-like snippet — "IERC20" isn't a function decl in C.sol
        10: L(100, 100, "i", "IERC20(token).balanceOf(addr)"),
        20: L(50, 50, "-", "function balanceOf(address) public view returns (uint256)"),
      } as Record<number, SourceLocation>,
    };
    const sourcesByAddr = {
      "0xaaa": [
        {
          name: "C.sol",
          content: [
            "contract Token {",
            "",
            "",
            "",
            "  function balanceOf(address account) public view returns (uint256) {",
            "    return 0;",
            "  }",
            "}",
          ].join("\n"),
        },
      ],
    };
    const tree = buildExecutionTree(
      root,
      new Map([[root, 0]]),
      steps,
      maps,
      undefined,
      undefined,
      sourcesByAddr,
    );
    // fnIndex's enclosing-line lookup picks balanceOf (correct). The
    // call-site candidate "IERC20" isn't a fn in C.sol so the override
    // doesn't fire and "balanceOf" stands.
    expect(fns(tree)[0]!.name).toBe("balanceOf");
  });

  it("surfaces a toggled opcode as a leaf in the scope that ran it", () => {
    const root = frame("0xAAA");
    const steps = [step(0, 1), step(10, 1, "SSTORE"), step(20, 1, "TLOAD"), step(30, 1)];
    const tree = buildExecutionTree(root, new Map([[root, 0]]), steps, {}, undefined, new Set(["SSTORE"]));
    const ops = kids(tree).filter((c) => c.kind === "op") as Extract<ExecNode, { kind: "op" }>[];
    expect(ops).toHaveLength(1); // only SSTORE toggled; TLOAD ignored
    expect(ops[0]!.op).toBe("SSTORE");
    expect(ops[0]!.step).toBe(1); // step index of the SSTORE
  });
});

describe("filterExecutionTree", () => {
  const opNode: ExecNode = { kind: "op", step: 3, op: "SSTORE", pc: 10 };
  const logNode: ExecNode = { kind: "log", step: 2, name: "E()", topicCount: 1 };
  const childCall: ExecNode = { kind: "call", frame: frame("0xBBB"), startStep: 4, children: [] };
  // An internal fn that contains a library (SafeMath-style) fn.
  const libFn: ExecNode = { kind: "fn", name: "mul", line: 5, startStep: 6, entryStep: 6, endStep: 8, children: [opNode], lib: true };
  const fnNode: ExecNode = {
    kind: "fn", name: "f", line: 1, startStep: 1, entryStep: 1, endStep: 9,
    children: [logNode, libFn, childCall],
  };
  const root: ExecNode = { kind: "call", frame: frame("0xAAA"), startStep: 0, children: [fnNode] };
  const ALL = { internal: true, library: true, events: true };

  it("keeps everything when all categories are on", () => {
    const fn = kids(filterExecutionTree(root, ALL))[0]!;
    expect(kids(fn).map((c) => c.kind)).toEqual(["log", "fn", "call"]);
  });

  it("hides library functions but promotes their children", () => {
    const fn = kids(filterExecutionTree(root, { ...ALL, library: false }))[0]!;
    // mul (lib) dropped; its op child promoted next to the log and call.
    expect(kids(fn).map((c) => c.kind)).toEqual(["log", "op", "call"]);
  });

  it("hides internal functions, promoting children (and surfacing the lib fn)", () => {
    const out = filterExecutionTree(root, { ...ALL, internal: false });
    // f (internal) dropped → its children promoted to root; mul (lib) kept.
    expect(kids(out).map((c) => c.kind)).toEqual(["log", "fn", "call"]);
    expect((kids(out)[1] as Extract<ExecNode, { kind: "fn" }>).name).toBe("mul");
  });

  it("drops events when off", () => {
    const fn = kids(filterExecutionTree(root, { ...ALL, events: false }))[0]!;
    expect(kids(fn).map((c) => c.kind)).toEqual(["fn", "call"]); // log gone
  });
});

describe("computePcsByContract", () => {
  it("groups own-depth pcs by frame address", () => {
    const child = frame("0xBBB");
    const root = frame("0xAAA", [child]);
    const steps = [step(0, 1), step(10, 1), step(5, 2), step(11, 1)];
    const out = computePcsByContract(root, new Map([[root, 0], [child, 2]]), steps);
    expect(new Set(out["0xaaa"])).toEqual(new Set([0, 10, 11]));
    expect(out["0xbbb"]).toEqual([5]);
  });
});
