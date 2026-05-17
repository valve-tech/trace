import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { FullDebuggerLayout } from "../../src/templates/FullDebuggerLayout.js";
import { addrs, makeFrame } from "../fixtures.js";
import type {
  OpcodeStep,
  RiskFlag,
  StateDiff,
} from "../../src/types.js";
import type { Address, Hex } from "viem";

afterEach(() => cleanup());

const trace = () =>
  makeFrame({
    type: "CALL",
    children: [
      makeFrame({
        type: "DELEGATECALL",
        from: addrs.CONTRACT,
        to: addrs.VAULT,
        depth: 1,
      }),
    ],
  });

const opcodes = (): OpcodeStep[] => [
  {
    pc: 0,
    op: "PUSH1",
    gas: 100,
    gasCost: 3,
    depth: 1,
    stack: [],
    memory: [],
    storage: {},
  },
];

const stateDiffs = (): StateDiff[] => [
  {
    address: addrs.ALICE,
    storage: [],
    balanceBefore: 0n,
    balanceAfter: 1n,
  },
];

const risks = (): RiskFlag[] => [
  {
    type: "DELEGATECALL_UNRECOGNIZED",
    severity: "danger",
    message: "test risk",
    address: addrs.VAULT,
    depth: 1,
    childIndex: 0,
    reverted: false,
  },
];

describe("FullDebuggerLayout", () => {
  it("renders all four tab labels", () => {
    render(<FullDebuggerLayout trace={trace()} />);
    expect(screen.getByText("Call Tree")).toBeDefined();
    expect(screen.getByText("Opcodes")).toBeDefined();
    expect(screen.getByText("State Diff")).toBeDefined();
    expect(screen.getByText("Risks")).toBeDefined();
  });

  it("renders the trace tab by default with the CallTree", () => {
    render(<FullDebuggerLayout trace={trace()} />);
    // CallTree shows the call type chip
    expect(screen.getAllByText("CALL").length).toBeGreaterThan(0);
  });

  it("renders empty state on trace tab when no trace supplied", () => {
    render(<FullDebuggerLayout />);
    expect(screen.getByText("No trace loaded.")).toBeDefined();
  });

  it("switches tabs when clicked and shows opcodes empty state", () => {
    render(<FullDebuggerLayout trace={trace()} />);
    fireEvent.click(screen.getByText("Opcodes"));
    expect(screen.getByText("No opcode trace available.")).toBeDefined();
  });

  it("renders the opcode viewer when opcodes are present", () => {
    render(<FullDebuggerLayout trace={trace()} opcodes={opcodes()} />);
    fireEvent.click(screen.getByText("Opcodes"));
    expect(screen.getByText("PUSH1")).toBeDefined();
  });

  it("renders state diff tab with empty state when no diffs", () => {
    render(<FullDebuggerLayout trace={trace()} />);
    fireEvent.click(screen.getByText("State Diff"));
    expect(screen.getByText("No state diff data available.")).toBeDefined();
  });

  it("renders state diff panel when diffs present", () => {
    render(
      <FullDebuggerLayout trace={trace()} stateDiffs={stateDiffs()} />,
    );
    fireEvent.click(screen.getByText("State Diff"));
    expect(screen.getByText("State changes")).toBeDefined();
  });

  it("renders risks tab with empty state when no risks array", () => {
    render(<FullDebuggerLayout trace={trace()} />);
    fireEvent.click(screen.getByText("Risks"));
    expect(screen.getByText("No risk analysis available.")).toBeDefined();
  });

  it("renders findings panel when risks present", () => {
    render(<FullDebuggerLayout trace={trace()} risks={risks()} />);
    fireEvent.click(screen.getByText("Risks"));
    expect(screen.getByText("test risk")).toBeDefined();
  });

  it("renders FrameDetailPanel after a CallTree frame is selected", () => {
    render(<FullDebuggerLayout trace={trace()} />);
    // CallTree exposes clickable rows — clicking the root opens detail.
    // The CallTree's root call type chip is clickable on the row.
    // CallTree's "CALL" text appears in both the legend (not clickable) and
    // in each row's type badge. Click the row by walking up to the cursor-
    // pointer ancestor (the clickable row container).
    const callBadges = screen.getAllByText("CALL");
    const row = callBadges
      .map((el) => el.closest('[style*="cursor: pointer"]') as HTMLElement | null)
      .find((el): el is HTMLElement => el !== null)!;
    fireEvent.click(row);
    // FrameDetailPanel renders the "Input" section heading.
    expect(screen.getByText("Input")).toBeDefined();
  });

  it("respects defaultTab", () => {
    render(<FullDebuggerLayout trace={trace()} defaultTab="risks" />);
    expect(screen.getByText("No risk analysis available.")).toBeDefined();
  });

  it("falls back to first visible tab if defaultTab is hidden", () => {
    render(
      <FullDebuggerLayout
        trace={trace()}
        defaultTab="risks"
        hideTabs={["risks"]}
      />,
    );
    // Should land on trace (the first visible tab)
    expect(screen.queryByText("Risks")).toBeNull();
    expect(screen.getByText("Call Tree")).toBeDefined();
  });

  it("falls back to 'trace' when all tabs are hidden (defensive default)", () => {
    const { container } = render(
      <FullDebuggerLayout
        hideTabs={["trace", "opcodes", "state", "risks"]}
      />,
    );
    // No tabs visible
    expect(container.textContent).not.toContain("Call Tree");
    expect(container.textContent).not.toContain("Opcodes");
    // Trace empty state (default fallback) is rendered
    expect(screen.getByText("No trace loaded.")).toBeDefined();
  });

  it("hides specific tabs when hideTabs lists them", () => {
    render(
      <FullDebuggerLayout
        trace={trace()}
        hideTabs={["state", "risks"]}
      />,
    );
    expect(screen.queryByText("State Diff")).toBeNull();
    expect(screen.queryByText("Risks")).toBeNull();
    // Trace and Opcodes remain
    expect(screen.getByText("Call Tree")).toBeDefined();
    expect(screen.getByText("Opcodes")).toBeDefined();
  });

  it("resets selected frame when trace identity changes", () => {
    const { rerender } = render(<FullDebuggerLayout trace={trace()} />);
    const callBadges = screen.getAllByText("CALL");
    const row = callBadges
      .map((el) => el.closest('[style*="cursor: pointer"]') as HTMLElement | null)
      .find((el): el is HTMLElement => el !== null)!;
    fireEvent.click(row);
    expect(screen.getByText("Input")).toBeDefined();
    // Swap to a new trace — selection should clear.
    const otherTrace = makeFrame({
      type: "STATICCALL",
      to: addrs.BOB as Address,
      input: "0xabcd" as Hex,
    });
    rerender(<FullDebuggerLayout trace={otherTrace} />);
    // After reset, no FrameDetailPanel should be visible (Input is FrameDetailPanel's section)
    expect(screen.queryByText("Input")).toBeNull();
  });

  it("applies classNames slots: root, tabBar, tab, tabActive, content, empty", () => {
    const { container } = render(
      <FullDebuggerLayout
        classNames={{
          root: "tx-root",
          tabBar: "tx-tabbar",
          tab: "tx-tab",
          tabActive: "tx-tab-active",
          content: "tx-content",
          empty: "tx-empty",
        }}
      />,
    );
    expect(container.querySelector(".tx-root")).not.toBeNull();
    expect(container.querySelector(".tx-tabbar")).not.toBeNull();
    expect(container.querySelectorAll(".tx-tab").length).toBeGreaterThan(0);
    expect(container.querySelector(".tx-tab-active")).not.toBeNull();
    expect(container.querySelector(".tx-content")).not.toBeNull();
    expect(container.querySelector(".tx-empty")).not.toBeNull();
  });

  it("applies className and style to root", () => {
    const { container } = render(
      <FullDebuggerLayout
        className="outer-class"
        style={{ marginTop: "42px" }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("outer-class");
    expect(root.style.marginTop).toBe("42px");
  });

  it("returns empty className when no slot or override supplied", () => {
    const { container } = render(<FullDebuggerLayout />);
    expect((container.firstChild as HTMLElement).className).toBe("");
  });
});
