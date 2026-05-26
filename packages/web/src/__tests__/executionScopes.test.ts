import { describe, it, expect } from "vitest";
import {
  buildExecutionTree,
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
const kids = (n: ExecNode): ExecNode[] => (n.kind === "log" ? [] : n.children);
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
