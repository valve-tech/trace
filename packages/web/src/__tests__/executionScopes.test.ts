import { describe, it, expect } from "vitest";
import {
  buildScopesForFrame,
  computePcsByContract,
  buildScopesByFrame,
} from "../components/debugger/StepDebugger/executionScopes";
import type { OpcodeStep, CallFrame } from "../api/debugger";
import type { SourceLocation } from "../api/source";

function step(pc: number, depth: number, op = "JUMP"): OpcodeStep {
  return { pc, op, gas: 0, gasCost: 0, depth, stack: [], memory: [], storage: {} };
}

function loc(jumpType: string, snippet: string, line = 0): SourceLocation {
  return { file: "C.sol", line, column: 0, endLine: line, endColumn: 0, sourceSnippet: snippet, jumpType };
}

describe("buildScopesForFrame", () => {
  it("nests an inner call inside an outer one via jump i/o", () => {
    // depth-1 frame: enter pairFor, inside it enter sortTokens, return both.
    const steps = [
      step(0, 1), step(10, 1), step(20, 1), step(30, 1), step(40, 1), step(50, 1),
    ];
    const map: Record<number, SourceLocation> = {
      10: loc("i", "pairFor(a, b)", 704),
      20: loc("i", "sortTokens(x)", 224),
      30: loc("o", ""),
      40: loc("o", ""),
    };
    const scopes = buildScopesForFrame(0, steps, map);
    expect(scopes).toHaveLength(1);
    expect(scopes[0]!.funcName).toBe("pairFor");
    expect(scopes[0]!.startStep).toBe(1);
    expect(scopes[0]!.endStep).toBe(4);
    expect(scopes[0]!.children).toHaveLength(1);
    expect(scopes[0]!.children[0]!.funcName).toBe("sortTokens");
    expect(scopes[0]!.children[0]!.startStep).toBe(2);
    expect(scopes[0]!.children[0]!.endStep).toBe(3);
  });

  it("ignores steps inside a deeper sub-call", () => {
    // Between entering and returning, depth jumps to 2 (an external sub-call);
    // a jump 'i' at that depth must NOT be attributed to this frame.
    const steps = [step(0, 1), step(10, 1, "CALL"), step(0, 2), step(99, 2), step(11, 1)];
    const map: Record<number, SourceLocation> = {
      99: loc("i", "shouldNotAppear(z)", 1),
    };
    expect(buildScopesForFrame(0, steps, map)).toEqual([]);
  });

  it("closes an unbalanced open scope at the frame's last own step", () => {
    const steps = [step(0, 1), step(10, 1), step(20, 1)];
    const map: Record<number, SourceLocation> = { 10: loc("i", "foo()", 5) };
    const scopes = buildScopesForFrame(0, steps, map);
    expect(scopes[0]!.endStep).toBe(2);
  });
});

describe("computePcsByContract", () => {
  it("groups own-depth pcs by frame address", () => {
    const root: CallFrame = {
      type: "CALL", from: "0x0", to: "0xAAA", gas: "0x0", gasUsed: "0x0", input: "0x",
      calls: [{ type: "CALL", from: "0xAAA", to: "0xBBB", gas: "0x0", gasUsed: "0x0", input: "0x" }],
    };
    // root own steps at depth1 (pcs 0,10), child at depth2 (pc 5)
    const steps = [step(0, 1), step(10, 1), step(5, 2), step(11, 1)];
    const frameStepMap = new Map<CallFrame, number>([
      [root, 0],
      [root.calls![0]!, 2],
    ]);
    const out = computePcsByContract(root, frameStepMap, steps);
    expect(new Set(out["0xaaa"])).toEqual(new Set([0, 10, 11]));
    expect(out["0xbbb"]).toEqual([5]);
  });
});

describe("buildScopesByFrame", () => {
  it("only emits scopes for frames whose contract has a source map", () => {
    const root: CallFrame = {
      type: "CALL", from: "0x0", to: "0xAAA", gas: "0x0", gasUsed: "0x0", input: "0x",
    };
    const steps = [step(0, 1), step(10, 1), step(20, 1)];
    const maps = { "0xaaa": { 10: loc("i", "foo()", 1) } as Record<number, SourceLocation> };
    const byFrame = buildScopesByFrame(root, new Map([[root, 0]]), steps, maps);
    expect(byFrame.get(root)?.[0]?.funcName).toBe("foo");
    // No map for the address → no scopes.
    expect(buildScopesByFrame(root, new Map([[root, 0]]), steps, {}).size).toBe(0);
  });
});
