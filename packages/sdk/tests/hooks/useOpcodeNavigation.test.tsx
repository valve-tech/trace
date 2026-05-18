import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  isCallOp,
  isLogOp,
  isStorageOp,
  useOpcodeNavigation,
} from "../../src/hooks/index.js";
import type { OpcodeStep } from "../../src/types.js";

function step(op: string, overrides: Partial<OpcodeStep> = {}): OpcodeStep {
  return {
    pc: 0,
    op,
    gas: 100,
    gasCost: 3,
    depth: 1,
    stack: [],
    memory: [],
    storage: {},
    ...overrides,
  };
}

const STEPS: OpcodeStep[] = [
  step("PUSH1", { pc: 0 }),
  step("SSTORE", { pc: 2 }),
  step("PUSH1", { pc: 4 }),
  step("CALL", { pc: 6 }),
  step("LOG2", { pc: 8 }),
];

// ---------------------------------------------------------------------------
// Predicate helpers
// ---------------------------------------------------------------------------

describe("isCallOp", () => {
  it("matches every EVM call-family opcode", () => {
    for (const op of ["CALL", "DELEGATECALL", "STATICCALL", "CREATE", "CREATE2", "CALLCODE"]) {
      expect(isCallOp(op)).toBe(true);
    }
  });
  it("rejects non-call opcodes", () => {
    for (const op of ["PUSH1", "SSTORE", "LOG0", "STOP", "RETURN", ""]) {
      expect(isCallOp(op)).toBe(false);
    }
  });
});

describe("isStorageOp", () => {
  it("matches persistent and transient storage opcodes", () => {
    for (const op of ["SLOAD", "SSTORE", "TLOAD", "TSTORE"]) {
      expect(isStorageOp(op)).toBe(true);
    }
  });
  it("rejects unrelated opcodes", () => {
    for (const op of ["MLOAD", "MSTORE", "PUSH1", "CALL", ""]) {
      expect(isStorageOp(op)).toBe(false);
    }
  });
});

describe("isLogOp", () => {
  it("matches LOG0..LOG4 (prefix-based)", () => {
    for (const op of ["LOG0", "LOG1", "LOG2", "LOG3", "LOG4"]) {
      expect(isLogOp(op)).toBe(true);
    }
  });
  it("rejects opcodes that don't start with LOG", () => {
    for (const op of ["PUSH1", "BLOG", "", "log0"]) {
      expect(isLogOp(op)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// useOpcodeNavigation
// ---------------------------------------------------------------------------

describe("useOpcodeNavigation — initial state", () => {
  it("starts at index 0 by default and exposes the current step", () => {
    const { result } = renderHook(() => useOpcodeNavigation(STEPS));
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.step?.op).toBe("PUSH1");
    expect(result.current.totalSteps).toBe(5);
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(true);
  });

  it("honors initialIndex within range", () => {
    const { result } = renderHook(() =>
      useOpcodeNavigation(STEPS, { initialIndex: 3 }),
    );
    expect(result.current.currentIndex).toBe(3);
    expect(result.current.step?.op).toBe("CALL");
  });

  it("clamps initialIndex above totalSteps", () => {
    const { result } = renderHook(() =>
      useOpcodeNavigation(STEPS, { initialIndex: 999 }),
    );
    expect(result.current.currentIndex).toBe(4);
  });

  it("clamps initialIndex below zero", () => {
    const { result } = renderHook(() =>
      useOpcodeNavigation(STEPS, { initialIndex: -5 }),
    );
    expect(result.current.currentIndex).toBe(0);
  });

  it("handles an empty steps array", () => {
    const { result } = renderHook(() => useOpcodeNavigation([]));
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.step).toBeUndefined();
    expect(result.current.totalSteps).toBe(0);
    expect(result.current.canGoForward).toBe(false);
    expect(result.current.canGoBack).toBe(false);
  });
});

describe("useOpcodeNavigation — forward/back", () => {
  it("advances and rewinds in the middle", () => {
    const { result } = renderHook(() =>
      useOpcodeNavigation(STEPS, { initialIndex: 2 }),
    );
    act(() => result.current.goForward());
    expect(result.current.currentIndex).toBe(3);
    act(() => result.current.goBack());
    expect(result.current.currentIndex).toBe(2);
  });

  it("no-ops at the end", () => {
    const { result } = renderHook(() =>
      useOpcodeNavigation(STEPS, { initialIndex: 4 }),
    );
    expect(result.current.canGoForward).toBe(false);
    act(() => result.current.goForward());
    expect(result.current.currentIndex).toBe(4);
  });

  it("no-ops at the start", () => {
    const { result } = renderHook(() => useOpcodeNavigation(STEPS));
    expect(result.current.canGoBack).toBe(false);
    act(() => result.current.goBack());
    expect(result.current.currentIndex).toBe(0);
  });
});

describe("useOpcodeNavigation — jumpTo", () => {
  it("jumps within range", () => {
    const { result } = renderHook(() => useOpcodeNavigation(STEPS));
    act(() => result.current.jumpTo(3));
    expect(result.current.currentIndex).toBe(3);
  });

  it("clamps above totalSteps", () => {
    const { result } = renderHook(() => useOpcodeNavigation(STEPS));
    act(() => result.current.jumpTo(999));
    expect(result.current.currentIndex).toBe(4);
  });

  it("clamps below zero", () => {
    const { result } = renderHook(() =>
      useOpcodeNavigation(STEPS, { initialIndex: 3 }),
    );
    act(() => result.current.jumpTo(-1));
    expect(result.current.currentIndex).toBe(0);
  });

  it("no-ops on empty steps", () => {
    const { result } = renderHook(() => useOpcodeNavigation([]));
    act(() => result.current.jumpTo(5));
    expect(result.current.currentIndex).toBe(0);
  });
});

describe("useOpcodeNavigation — jumpToNext + named seekers", () => {
  it("seeks to the next matching opcode", () => {
    const { result } = renderHook(() => useOpcodeNavigation(STEPS));
    act(() => result.current.nextCall());
    expect(result.current.step?.op).toBe("CALL");
    expect(result.current.currentIndex).toBe(3);
  });

  it("skips the current step when seeking forward", () => {
    // Start *on* an SSTORE; nextStorage should land on the NEXT storage op,
    // not the one we're standing on. There is no second storage op in STEPS,
    // so the call should no-op.
    const { result } = renderHook(() =>
      useOpcodeNavigation(STEPS, { initialIndex: 1 }),
    );
    expect(result.current.step?.op).toBe("SSTORE");
    act(() => result.current.nextStorage());
    expect(result.current.currentIndex).toBe(1);
  });

  it("no-ops when no later match exists", () => {
    const { result } = renderHook(() =>
      useOpcodeNavigation(STEPS, { initialIndex: 4 }),
    );
    act(() => result.current.nextLog());
    expect(result.current.currentIndex).toBe(4);
  });

  it("nextLog jumps to the LOG step", () => {
    const { result } = renderHook(() => useOpcodeNavigation(STEPS));
    act(() => result.current.nextLog());
    expect(result.current.step?.op).toBe("LOG2");
  });

  it("nextStorage finds the SSTORE from the start", () => {
    const { result } = renderHook(() => useOpcodeNavigation(STEPS));
    act(() => result.current.nextStorage());
    expect(result.current.currentIndex).toBe(1);
  });

  it("accepts arbitrary predicates", () => {
    const { result } = renderHook(() => useOpcodeNavigation(STEPS));
    act(() => result.current.jumpToNext((op) => op === "PUSH1"));
    // currentIndex starts at 0 (also PUSH1); jumpToNext starts strictly after,
    // so it finds the PUSH1 at index 2.
    expect(result.current.currentIndex).toBe(2);
  });
});

describe("useOpcodeNavigation — reactivity", () => {
  it("resets to initialIndex when steps identity changes", () => {
    const stepsA: OpcodeStep[] = [step("PUSH1"), step("CALL"), step("STOP")];
    const stepsB: OpcodeStep[] = [step("SSTORE"), step("RETURN")];

    const { result, rerender } = renderHook(
      ({ s }: { s: OpcodeStep[] }) => useOpcodeNavigation(s),
      { initialProps: { s: stepsA } },
    );
    act(() => result.current.jumpTo(2));
    expect(result.current.currentIndex).toBe(2);

    rerender({ s: stepsB });
    // Reset to 0; the previous index (2) would have been out of range anyway,
    // but the contract is "reset to initialIndex on identity change".
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.totalSteps).toBe(2);
    expect(result.current.step?.op).toBe("SSTORE");
  });

  it("re-anchors when initialIndex changes", () => {
    const { result, rerender } = renderHook(
      ({ idx }: { idx: number }) =>
        useOpcodeNavigation(STEPS, { initialIndex: idx }),
      { initialProps: { idx: 0 } },
    );
    expect(result.current.currentIndex).toBe(0);
    rerender({ idx: 3 });
    expect(result.current.currentIndex).toBe(3);
  });
});
