import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StepDebugger from "../components/debugger/StepDebugger";
import type { OpcodeStep } from "../api/debugger";

function makeStep(overrides: Partial<OpcodeStep> = {}): OpcodeStep {
  return {
    pc: 0,
    op: "PUSH1",
    gas: 100000,
    gasCost: 3,
    depth: 1,
    stack: [],
    memory: [],
    storage: {},
    ...overrides,
  };
}

const SAMPLE_STEPS: OpcodeStep[] = [
  makeStep({ pc: 0, op: "PUSH1", stack: [], gasCost: 3 }),
  makeStep({ pc: 2, op: "PUSH1", stack: ["0x80"], gasCost: 3 }),
  makeStep({ pc: 4, op: "MSTORE", stack: ["0x80", "0x40"], gasCost: 12 }),
  makeStep({ pc: 5, op: "SLOAD", stack: ["0x00"], gasCost: 2100 }),
  makeStep({
    pc: 6,
    op: "SSTORE",
    stack: ["0x00", "0x01"],
    gasCost: 20000,
    storage: { "0x00": "0x01" },
  }),
  makeStep({ pc: 7, op: "CALL", stack: ["0xff"], gasCost: 700, depth: 1 }),
  makeStep({ pc: 8, op: "LOG1", stack: [], gasCost: 375 }),
  makeStep({ pc: 9, op: "RETURN", stack: [], gasCost: 0 }),
];

describe("StepDebugger", () => {
  it("renders step counter showing total steps", () => {
    render(<StepDebugger steps={SAMPLE_STEPS} />);
    expect(screen.getByText(/1 \/ 8/)).toBeInTheDocument();
  });

  it("renders the initial opcode name in context bar", () => {
    render(<StepDebugger steps={SAMPLE_STEPS} />);
    // PUSH1 appears in both context bar and trace list
    const push1Elements = screen.getAllByText("PUSH1");
    expect(push1Elements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows keyboard shortcuts", () => {
    render(<StepDebugger steps={SAMPLE_STEPS} />);
    expect(screen.getByText("Next CALL")).toBeInTheDocument();
    expect(screen.getByText("Next SSTORE")).toBeInTheDocument();
    expect(screen.getByText("Next LOG")).toBeInTheDocument();
  });

  it("steps forward when clicking the > button", () => {
    render(<StepDebugger steps={SAMPLE_STEPS} />);
    const forwardBtn = screen.getByTitle("Step forward (Right arrow / Space)");
    fireEvent.click(forwardBtn);
    expect(screen.getByText(/2 \/ 8/)).toBeInTheDocument();
  });

  it("steps backward when clicking the < button", () => {
    render(<StepDebugger steps={SAMPLE_STEPS} />);
    // Go forward first
    const forwardBtn = screen.getByTitle("Step forward (Right arrow / Space)");
    fireEvent.click(forwardBtn);
    fireEvent.click(forwardBtn);
    expect(screen.getByText(/3 \/ 8/)).toBeInTheDocument();

    // Then backward
    const backBtn = screen.getByTitle("Step back (Left arrow)");
    fireEvent.click(backBtn);
    expect(screen.getByText(/2 \/ 8/)).toBeInTheDocument();
  });

  it("jumps to next CALL opcode", () => {
    render(<StepDebugger steps={SAMPLE_STEPS} />);
    const callBtn = screen.getByTitle("Next CALL (C)");
    fireEvent.click(callBtn);
    // CALL is at index 5
    expect(screen.getByText(/6 \/ 8/)).toBeInTheDocument();
  });

  it("jumps to next storage op (SLOAD/SSTORE)", () => {
    render(<StepDebugger steps={SAMPLE_STEPS} />);
    const sstoreBtn = screen.getByTitle("Next SSTORE (S)");
    fireEvent.click(sstoreBtn);
    // SLOAD is at index 3 (first storage op)
    expect(screen.getByText(/4 \/ 8/)).toBeInTheDocument();
  });

  it("jumps to start and end", () => {
    render(<StepDebugger steps={SAMPLE_STEPS} />);
    const endBtn = screen.getByTitle("Jump to end (End)");
    fireEvent.click(endBtn);
    expect(screen.getByText(/8 \/ 8/)).toBeInTheDocument();

    const startBtn = screen.getByTitle("Jump to start (Home)");
    fireEvent.click(startBtn);
    expect(screen.getByText(/1 \/ 8/)).toBeInTheDocument();
  });

  it("shows empty stack message when stack is empty", () => {
    render(<StepDebugger steps={SAMPLE_STEPS} />);
    expect(screen.getByText("Stack is empty")).toBeInTheDocument();
  });

  it("shows stack entries after stepping to a step with stack data", () => {
    render(<StepDebugger steps={SAMPLE_STEPS} />);
    const forwardBtn = screen.getByTitle("Step forward (Right arrow / Space)");
    fireEvent.click(forwardBtn);
    // Step 1 has stack: ["0x80"]
    expect(screen.queryByText("Stack is empty")).not.toBeInTheDocument();
  });

  it("shows storage changes at SSTORE step", () => {
    render(<StepDebugger steps={SAMPLE_STEPS} />);
    // Navigate to SSTORE (index 4) by clicking Next twice (first hits SLOAD at 3)
    const sstoreBtn = screen.getByTitle("Next SSTORE (S)");
    fireEvent.click(sstoreBtn); // SLOAD at index 3
    fireEvent.click(sstoreBtn); // SSTORE at index 4
    // Should show storage panel with the change
    expect(screen.getByText("1 changes")).toBeInTheDocument();
  });

  it("shows memory is empty when no memory data", () => {
    render(<StepDebugger steps={SAMPLE_STEPS} />);
    expect(screen.getByText("Memory is empty")).toBeInTheDocument();
  });
});
