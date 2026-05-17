import { describe, it, expect } from "vitest";
import {
  classifyOpcode,
  getOpcodeColor,
  isExpensiveOp,
  OPCODE_CATEGORY_COLORS,
} from "../../src/components/opcodeClassify.js";

describe("classifyOpcode", () => {
  it("classifies storage ops", () => {
    expect(classifyOpcode("SLOAD")).toBe("storage");
    expect(classifyOpcode("SSTORE")).toBe("storage");
  });

  it("classifies memory ops", () => {
    expect(classifyOpcode("MLOAD")).toBe("memory");
    expect(classifyOpcode("MSTORE")).toBe("memory");
    expect(classifyOpcode("MSTORE8")).toBe("memory");
    expect(classifyOpcode("MSIZE")).toBe("memory");
    expect(classifyOpcode("MCOPY")).toBe("memory");
  });

  it("classifies call ops", () => {
    expect(classifyOpcode("CALL")).toBe("call");
    expect(classifyOpcode("STATICCALL")).toBe("call");
    expect(classifyOpcode("DELEGATECALL")).toBe("call");
    expect(classifyOpcode("CALLCODE")).toBe("call");
    expect(classifyOpcode("CREATE")).toBe("call");
    expect(classifyOpcode("CREATE2")).toBe("call");
    expect(classifyOpcode("SELFDESTRUCT")).toBe("call");
  });

  it("classifies stack ops by prefix and POP", () => {
    expect(classifyOpcode("PUSH1")).toBe("stack");
    expect(classifyOpcode("PUSH32")).toBe("stack");
    expect(classifyOpcode("DUP1")).toBe("stack");
    expect(classifyOpcode("DUP16")).toBe("stack");
    expect(classifyOpcode("SWAP1")).toBe("stack");
    expect(classifyOpcode("SWAP16")).toBe("stack");
    expect(classifyOpcode("POP")).toBe("stack");
  });

  it("classifies logging ops by LOG prefix", () => {
    expect(classifyOpcode("LOG0")).toBe("logging");
    expect(classifyOpcode("LOG1")).toBe("logging");
    expect(classifyOpcode("LOG4")).toBe("logging");
  });

  it("classifies hash ops (SHA3 and KECCAK256)", () => {
    expect(classifyOpcode("SHA3")).toBe("hash");
    expect(classifyOpcode("KECCAK256")).toBe("hash");
  });

  it("classifies control-flow ops", () => {
    expect(classifyOpcode("JUMP")).toBe("control");
    expect(classifyOpcode("JUMPI")).toBe("control");
    expect(classifyOpcode("JUMPDEST")).toBe("control");
    expect(classifyOpcode("STOP")).toBe("control");
    expect(classifyOpcode("RETURN")).toBe("control");
    expect(classifyOpcode("REVERT")).toBe("control");
    expect(classifyOpcode("INVALID")).toBe("control");
  });

  it("falls back to 'other' for unknown opcodes", () => {
    expect(classifyOpcode("ADD")).toBe("other");
    expect(classifyOpcode("MUL")).toBe("other");
    expect(classifyOpcode("UNKNOWN_OPCODE")).toBe("other");
  });
});

describe("getOpcodeColor", () => {
  it("returns the category's color", () => {
    expect(getOpcodeColor("SLOAD")).toBe(OPCODE_CATEGORY_COLORS.storage);
    expect(getOpcodeColor("MLOAD")).toBe(OPCODE_CATEGORY_COLORS.memory);
    expect(getOpcodeColor("CALL")).toBe(OPCODE_CATEGORY_COLORS.call);
    expect(getOpcodeColor("PUSH1")).toBe(OPCODE_CATEGORY_COLORS.stack);
    expect(getOpcodeColor("LOG1")).toBe(OPCODE_CATEGORY_COLORS.logging);
    expect(getOpcodeColor("SHA3")).toBe(OPCODE_CATEGORY_COLORS.hash);
    expect(getOpcodeColor("JUMP")).toBe(OPCODE_CATEGORY_COLORS.control);
    expect(getOpcodeColor("ADD")).toBe(OPCODE_CATEGORY_COLORS.other);
  });
});

describe("isExpensiveOp", () => {
  it("flags state-touching ops", () => {
    expect(isExpensiveOp("SSTORE")).toBe(true);
    expect(isExpensiveOp("SLOAD")).toBe(true);
  });

  it("flags external-call ops", () => {
    for (const op of [
      "CALL",
      "STATICCALL",
      "DELEGATECALL",
      "CALLCODE",
      "CREATE",
      "CREATE2",
      "SELFDESTRUCT",
    ]) {
      expect(isExpensiveOp(op)).toBe(true);
    }
  });

  it("flags all LOG variants", () => {
    expect(isExpensiveOp("LOG0")).toBe(true);
    expect(isExpensiveOp("LOG1")).toBe(true);
    expect(isExpensiveOp("LOG4")).toBe(true);
  });

  it("does not flag arithmetic / stack ops", () => {
    expect(isExpensiveOp("ADD")).toBe(false);
    expect(isExpensiveOp("PUSH1")).toBe(false);
    expect(isExpensiveOp("POP")).toBe(false);
    expect(isExpensiveOp("JUMP")).toBe(false);
  });
});
