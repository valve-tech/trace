import { describe, it, expect } from "vitest";
import { describeOperands } from "../components/debugger/StepDebugger/opcodeOperands";

// Stacks are written bottom-first, so the last element is the top of stack —
// the same convention the struct logger uses.
describe("describeOperands", () => {
  it("returns null for an unmodeled opcode", () => {
    expect(describeOperands("INVALID", [])).toBeNull();
  });

  it("maps SLOAD's slot to the storage target and the top stack slot", () => {
    const stack = ["0xdead", "0x1a"]; // top = 0x1a
    const info = describeOperands("SLOAD", stack)!;
    expect(info.storageSlot).toBe("0x1a");
    expect(info.inputIndices).toEqual([1]); // index of the top
    expect(info.args).toEqual([{ name: "slot", value: "0x1a" }]);
    expect(info.outputs).toBe(1);
    expect(info.signature).toBe("SLOAD(slot)");
  });

  it("computes MSTORE's memory write region from offset + fixed 32", () => {
    const stack = ["0x40", "0x80"]; // top=value=0x80, next=offset=0x40
    const info = describeOperands("MSTORE", stack)!;
    // offset is the top input (0x40), value is next.
    expect(info.args[0]).toEqual({ name: "offset", value: "0x80" });
    expect(info.memory).toEqual({ kind: "write", offset: 0x80, size: 32 });
    expect(info.outputs).toBe(0);
  });

  it("reads the args region for CALL", () => {
    // CALL inputs top-first: gas,address,value,argsOffset,argsSize,retOffset,retSize
    const stack = ["0x7", "0x6", "0x40", "0x4", "0x3", "0x2", "0x1"].reverse();
    const info = describeOperands("CALL", stack)!;
    expect(info.memory?.kind).toBe("read");
    expect(info.signature).toContain("CALL(gas, address, value");
    expect(info.outputs).toBe(1);
  });

  it("models DUPn as reading the nth-from-top and pushing", () => {
    const info = describeOperands("DUP2", ["0xa", "0xb", "0xc"])!;
    expect(info.outputs).toBe(1);
    expect(info.inputIndices.length).toBe(2);
  });

  it("clamps absurd memory offsets instead of throwing", () => {
    const huge = "0x" + "f".repeat(64);
    const info = describeOperands("MLOAD", [huge])!;
    expect(info.memory!.offset).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });
});
