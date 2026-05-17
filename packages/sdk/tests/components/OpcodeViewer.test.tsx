import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { OpcodeViewer } from "../../src/components/OpcodeViewer.js";
import type { OpcodeStep } from "../../src/types.js";
import type { Hex } from "viem";

afterEach(() => cleanup());

function step(overrides: Partial<OpcodeStep> = {}): OpcodeStep {
  return {
    pc: 0,
    op: "PUSH1",
    gas: 100,
    gasCost: 3,
    depth: 1,
    stack: [],
    memory: [],
    storage: {},
    ...overrides,
  };
}

const SAMPLE: OpcodeStep[] = [
  step({ pc: 0, op: "PUSH1", gas: 100 }),
  step({ pc: 2, op: "SSTORE", gas: 90, gasCost: 22100 }),
  step({
    pc: 3,
    op: "CALL",
    gas: 80,
    gasCost: 700,
    stack: ["0x1", "0x2", "0x3"] as Hex[],
  }),
  step({ pc: 5, op: "JUMP", gas: 70 }),
];

describe("OpcodeViewer", () => {
  it("renders the header with the step count", () => {
    render(<OpcodeViewer steps={SAMPLE} hideLegend />);
    expect(screen.getByText("Opcode Trace")).toBeDefined();
    expect(screen.getByText(/4 steps/)).toBeDefined();
  });

  it("hides the header when hideHeader=true", () => {
    render(<OpcodeViewer steps={SAMPLE} hideHeader hideLegend />);
    expect(screen.queryByText("Opcode Trace")).toBeNull();
  });

  it("hides the legend when hideLegend=true", () => {
    const { container } = render(<OpcodeViewer steps={SAMPLE} hideLegend />);
    expect(container.textContent).not.toContain("Logging");
  });

  it("renders every visible step's opcode", () => {
    render(<OpcodeViewer steps={SAMPLE} hideLegend />);
    expect(screen.getByText("PUSH1")).toBeDefined();
    expect(screen.getByText("SSTORE")).toBeDefined();
    expect(screen.getByText("CALL")).toBeDefined();
    expect(screen.getByText("JUMP")).toBeDefined();
  });

  it("filters by opcode (case-insensitive substring)", () => {
    render(<OpcodeViewer steps={SAMPLE} hideLegend />);
    const input = screen.getByLabelText("Filter opcodes");
    fireEvent.change(input, { target: { value: "call" } });
    expect(screen.getByText("CALL")).toBeDefined();
    expect(screen.queryByText("PUSH1")).toBeNull();
    expect(screen.getByText(/1 steps/)).toBeDefined();
    expect(screen.getByText(/filtered from 4/)).toBeDefined();
  });

  it("clears filter to show all steps", () => {
    render(<OpcodeViewer steps={SAMPLE} hideLegend />);
    const input = screen.getByLabelText("Filter opcodes");
    fireEvent.change(input, { target: { value: "call" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("PUSH1")).toBeDefined();
  });

  it("expands a row on click and shows its stack", () => {
    render(<OpcodeViewer steps={SAMPLE} hideLegend />);
    expect(screen.queryByText(/Stack \(3 items\)/)).toBeNull();
    fireEvent.click(screen.getByText("CALL"));
    expect(screen.getByText(/Stack \(3 items\)/)).toBeDefined();
  });

  it("collapses a previously expanded row on second click", () => {
    render(<OpcodeViewer steps={SAMPLE} hideLegend />);
    fireEvent.click(screen.getByText("CALL"));
    fireEvent.click(screen.getByText("CALL"));
    expect(screen.queryByText(/Stack \(3 items\)/)).toBeNull();
  });

  it("calls onSelectStep with index and step", () => {
    const onSelect = vi.fn();
    render(
      <OpcodeViewer steps={SAMPLE} onSelectStep={onSelect} hideLegend />,
    );
    fireEvent.click(screen.getByText("CALL"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toBe(2);
    expect(onSelect.mock.calls[0]![1]).toBe(SAMPLE[2]);
  });

  it("shows 'no data' placeholder when expanded row has no stack/memory/storage", () => {
    render(<OpcodeViewer steps={SAMPLE} hideLegend />);
    fireEvent.click(screen.getByText("PUSH1"));
    expect(
      screen.getByText(/No stack, memory, or storage data/),
    ).toBeDefined();
  });

  it("shows memory panel when step has memory", () => {
    const withMem = [
      step({
        pc: 0,
        op: "MSTORE",
        memory: ["0x" + "00".repeat(32), "0x" + "11".repeat(32)] as Hex[],
      }),
    ];
    render(<OpcodeViewer steps={withMem} hideLegend />);
    fireEvent.click(screen.getByText("MSTORE"));
    expect(screen.getByText(/Memory \(2 words\)/)).toBeDefined();
  });

  it("truncates memory display past 16 words and shows the remaining-count", () => {
    const longMem = Array.from(
      { length: 20 },
      (_, i) => `0x${i.toString(16).padStart(64, "0")}` as Hex,
    );
    const withLongMem = [step({ op: "MSTORE", memory: longMem })];
    render(<OpcodeViewer steps={withLongMem} hideLegend />);
    fireEvent.click(screen.getByText("MSTORE"));
    expect(screen.getByText(/4 more words/)).toBeDefined();
  });

  it("shows storage panel when step has storage changes", () => {
    const withStorage = [
      step({
        op: "SSTORE",
        storage: { ["0x" + "00".repeat(32)]: "0x42" } as Record<Hex, Hex>,
      }),
    ];
    render(<OpcodeViewer steps={withStorage} hideLegend />);
    fireEvent.click(screen.getByText("SSTORE"));
    expect(screen.getByText("Storage changes:")).toBeDefined();
    expect(screen.getByText("0x42")).toBeDefined();
  });

  it("paginates: shows 'Load more' when steps exceed rowsPerPage", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      step({ pc: i, op: i % 2 === 0 ? "PUSH1" : "POP" }),
    );
    render(<OpcodeViewer steps={many} rowsPerPage={3} hideLegend />);
    expect(screen.getByText(/Load 2 more steps/)).toBeDefined();
    expect(screen.getByText(/2 remaining/)).toBeDefined();
  });

  it("loads more on click", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      step({ pc: i, op: i === 4 ? "STOP" : "PUSH1" }),
    );
    render(<OpcodeViewer steps={many} rowsPerPage={3} hideLegend />);
    expect(screen.queryByText("STOP")).toBeNull();
    fireEvent.click(screen.getByText(/Load 2 more/));
    expect(screen.getByText("STOP")).toBeDefined();
  });

  it("resets pagination when filter changes", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      step({ pc: i, op: "PUSH1" }),
    );
    render(<OpcodeViewer steps={many} rowsPerPage={2} hideLegend />);
    // After loading more, we have 4 visible. Now filter — should reset.
    fireEvent.click(screen.getByText(/Load 2 more/));
    expect(screen.getAllByText("PUSH1")).toHaveLength(4);
    const input = screen.getByLabelText("Filter opcodes");
    fireEvent.change(input, { target: { value: "push" } });
    // After filter+reset, only first `rowsPerPage` matches show
    expect(screen.getAllByText("PUSH1")).toHaveLength(2);
  });

  it("highlights expensive ops with a danger dot", () => {
    const { container } = render(
      <OpcodeViewer steps={SAMPLE} hideLegend />,
    );
    const dots = container.querySelectorAll('[title="Expensive operation"]');
    // SSTORE and CALL are expensive; PUSH1 and JUMP are not.
    expect(dots).toHaveLength(2);
  });

  it("renders the legend by default with all 7 category labels", () => {
    render(<OpcodeViewer steps={SAMPLE} />);
    for (const label of [
      "Stack",
      "Memory",
      "Storage",
      "Calls",
      "Logging",
      "Hash",
      "Control",
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it("applies className and classNames.root", () => {
    const { container } = render(
      <OpcodeViewer
        steps={SAMPLE}
        hideLegend
        hideHeader
        className="my-viewer"
        classNames={{ root: "extra" }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("my-viewer");
    expect(root.className).toContain("extra");
  });
});
