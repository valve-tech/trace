import { describe, it, expect } from "vitest";
import { opcodeFrequencies } from "../components/debugger/StepDebugger/opcodeStats";
import type { OpcodeStep } from "../api/debugger";

function step(op: string, gasCost: number): OpcodeStep {
  return { pc: 0, op, gas: 0, gasCost, depth: 1, stack: [], memory: [], storage: {} };
}

describe("opcodeFrequencies", () => {
  it("returns an empty list for no steps", () => {
    expect(opcodeFrequencies([])).toEqual([]);
  });

  it("counts occurrences and sums gas per opcode", () => {
    const freqs = opcodeFrequencies([
      step("PUSH1", 3),
      step("PUSH1", 3),
      step("SSTORE", 20000),
    ]);
    const push1 = freqs.find((f) => f.op === "PUSH1");
    const sstore = freqs.find((f) => f.op === "SSTORE");
    expect(push1).toEqual({ op: "PUSH1", count: 2, gas: 6 });
    expect(sstore).toEqual({ op: "SSTORE", count: 1, gas: 20000 });
  });

  it("sorts by count descending, then alphabetically on ties", () => {
    const freqs = opcodeFrequencies([
      step("MSTORE", 3),
      step("ADD", 3),
      step("PUSH1", 3),
      step("PUSH1", 3),
    ]);
    expect(freqs.map((f) => f.op)).toEqual(["PUSH1", "ADD", "MSTORE"]);
  });

  it("keeps each distinct opcode exactly once", () => {
    const freqs = opcodeFrequencies([step("ADD", 3), step("ADDRESS", 2), step("ADD", 3)]);
    expect(freqs).toHaveLength(2);
    expect(freqs.find((f) => f.op === "ADD")?.count).toBe(2);
    expect(freqs.find((f) => f.op === "ADDRESS")?.count).toBe(1);
  });
});
