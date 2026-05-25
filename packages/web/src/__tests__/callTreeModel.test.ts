import { describe, it, expect } from "vitest";
import { mapFramesToSteps } from "../components/debugger/StepDebugger/callTreeModel";
import type { CallFrame, OpcodeStep } from "../api/debugger";

// Minimal step: only pc/op/depth matter to the mapper.
function step(depth: number, op = "JUMPDEST"): OpcodeStep {
  return { pc: 0, op, gas: 0, gasCost: 0, depth, stack: [], memory: [], storage: {} };
}

// Minimal frame: only `calls` is read by the mapper.
function frame(to: string, type: string, calls: CallFrame[] = []): CallFrame {
  return { type, to, input: "0x", calls } as unknown as CallFrame;
}

describe("mapFramesToSteps", () => {
  it("maps frames by opcode depth across CALL / STATICCALL / DELEGATECALL", () => {
    const C = frame("0xC", "DELEGATECALL");
    const A = frame("0xA", "CALL");
    const B = frame("0xB", "STATICCALL", [C]);
    const D = frame("0xD", "CALL"); // codeless callee (EOA) — runs no opcodes
    const root = frame("0xRoot", "CALL", [A, B, D]);

    // depth-by-step (see expected entries in the asserts):
    const steps: OpcodeStep[] = [
      step(1), // 0  root
      step(1), // 1
      step(1, "CALL"), // 2  → calls A
      step(2), // 3  A entry
      step(2), // 4
      step(1), // 5  back in root
      step(1, "STATICCALL"), // 6 → calls B
      step(2), // 7  B entry
      step(2, "DELEGATECALL"), // 8 → calls C
      step(3), // 9  C entry
      step(3), // 10
      step(2), // 11 back in B
      step(1), // 12 back in root
      step(1, "CALL"), // 13 → calls D (codeless)
      step(1), // 14 D returned immediately, no depth increase
      step(1), // 15
    ];

    const m = mapFramesToSteps(root, steps);
    expect(m.get(root)).toBe(0);
    expect(m.get(A)).toBe(3);
    expect(m.get(B)).toBe(7);
    expect(m.get(C)).toBe(9); // nested via DELEGATECALL — depth 3
    expect(m.get(D)).toBe(0); // codeless → falls back to parent (root) step
  });

  it("maps every frame to 0 when there is no opcode trace", () => {
    const child = frame("0xC", "CALL");
    const root = frame("0xRoot", "CALL", [child]);
    const m = mapFramesToSteps(root, []);
    expect(m.get(root)).toBe(0);
    expect(m.get(child)).toBe(0);
  });

  it("handles sibling external calls in order (not by CALL count)", () => {
    const A = frame("0xA", "STATICCALL"); // first child, but a STATICCALL
    const B = frame("0xB", "CALL");
    const root = frame("0xRoot", "CALL", [A, B]);
    const steps: OpcodeStep[] = [
      step(1), // 0
      step(1, "STATICCALL"), // 1 → A
      step(2), // 2  A entry
      step(1), // 3
      step(1, "CALL"), // 4 → B
      step(2), // 5  B entry
      step(1), // 6
    ];
    const m = mapFramesToSteps(root, steps);
    expect(m.get(A)).toBe(2);
    expect(m.get(B)).toBe(5);
  });
});
