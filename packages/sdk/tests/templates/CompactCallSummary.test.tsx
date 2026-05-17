import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { CompactCallSummary } from "../../src/templates/CompactCallSummary.js";
import { addrs, makeFrame } from "../fixtures.js";
import type { Hex } from "viem";

afterEach(() => cleanup());

const SAMPLE = () =>
  makeFrame({
    type: "CALL",
    gasUsed: 100_000n,
    input: "0xa9059cbb000000000000000000" as Hex,
    children: [
      makeFrame({
        type: "STATICCALL",
        from: addrs.CONTRACT,
        to: addrs.VAULT,
        gasUsed: 30_000n,
        depth: 1,
        input: "0x70a08231" as Hex,
        children: [
          makeFrame({
            type: "DELEGATECALL",
            from: addrs.VAULT,
            to: addrs.BOB,
            gasUsed: 10_000n,
            depth: 2,
          }),
        ],
      }),
      makeFrame({
        type: "CALL",
        from: addrs.CONTRACT,
        to: addrs.BOB,
        gasUsed: 5_000n,
        depth: 1,
        error: "execution reverted",
      }),
    ],
  });

describe("CompactCallSummary", () => {
  it("renders SUCCESS badge when no frames reverted", () => {
    render(<CompactCallSummary frame={makeFrame({ type: "CALL" })} />);
    expect(screen.getByText("SUCCESS")).toBeDefined();
  });

  it("renders REVERTED badge when any frame reverted", () => {
    render(<CompactCallSummary frame={SAMPLE()} />);
    expect(screen.getByText("REVERTED")).toBeDefined();
  });

  it("renders REVERTED when only the root frame reverted", () => {
    render(
      <CompactCallSummary
        frame={makeFrame({ type: "CALL", error: "execution reverted" })}
      />,
    );
    expect(screen.getByText("REVERTED")).toBeDefined();
  });

  it("hides header when hideHeader=true", () => {
    render(<CompactCallSummary frame={makeFrame({})} hideHeader />);
    expect(screen.queryByText("SUCCESS")).toBeNull();
  });

  it("renders one line per frame (no maxDepth)", () => {
    const { container } = render(<CompactCallSummary frame={SAMPLE()} hideHeader />);
    // CALL types in the sample: root CALL, STATICCALL, DELEGATECALL, sub-CALL
    expect(container.textContent).toContain("CALL");
    expect(container.textContent).toContain("STATICCALL");
    expect(container.textContent).toContain("DELEGATECALL");
  });

  it("limits depth with maxDepth and shows a truncation footer", () => {
    const { container } = render(
      <CompactCallSummary frame={SAMPLE()} maxDepth={1} />,
    );
    // Depth 2 DELEGATECALL is hidden
    expect(container.textContent).not.toContain("DELEGATECALL");
    expect(container.textContent).toMatch(/1 deeper frame hidden/);
  });

  it("uses 'frames' plural when multiple frames are elided", () => {
    const deep = makeFrame({
      type: "CALL",
      children: [
        makeFrame({
          type: "CALL",
          depth: 1,
          children: [
            makeFrame({ type: "CALL", depth: 2 }),
            makeFrame({ type: "CALL", depth: 2 }),
          ],
        }),
      ],
    });
    render(<CompactCallSummary frame={deep} maxDepth={1} />);
    expect(screen.getByText(/2 deeper frames hidden/)).toBeDefined();
  });

  it("does NOT render truncation footer when nothing was hidden", () => {
    const { container } = render(
      <CompactCallSummary
        frame={makeFrame({ type: "CALL" })}
        classNames={{ truncationFooter: "tx-trunc" }}
      />,
    );
    expect(container.querySelector(".tx-trunc")).toBeNull();
  });

  it("renders '(create)' for CREATE frames with null to", () => {
    render(
      <CompactCallSummary
        frame={makeFrame({ type: "CREATE", to: null })}
        hideHeader
      />,
    );
    expect(screen.getByText("(create)")).toBeDefined();
  });

  it("shows the function selector when input is long enough", () => {
    render(
      <CompactCallSummary
        frame={makeFrame({ input: "0xdeadbeef00000000" as Hex })}
        hideHeader
      />,
    );
    expect(screen.getByText("0xdeadbeef")).toBeDefined();
  });

  it("omits the selector when input is too short", () => {
    const { container } = render(
      <CompactCallSummary
        frame={makeFrame({ input: "0x42" as Hex })}
        hideHeader
        classNames={{ selector: "tx-selector" }}
      />,
    );
    expect(container.querySelector(".tx-selector")).toBeNull();
  });

  it("renders a REVERT chip on reverted frames", () => {
    render(<CompactCallSummary frame={SAMPLE()} hideHeader />);
    expect(screen.getByText("REVERT")).toBeDefined();
  });

  it("invokes onSelect when a line is clicked", () => {
    const handler = vi.fn();
    const f = makeFrame({ type: "CALL" });
    render(<CompactCallSummary frame={f} onSelect={handler} hideHeader />);
    // Click the CALL chip — first row.
    fireEvent.click(screen.getByText("CALL"));
    expect(handler).toHaveBeenCalled();
  });

  it("does not throw when a line is clicked without onSelect", () => {
    render(<CompactCallSummary frame={makeFrame({ type: "CALL" })} hideHeader />);
    expect(() => fireEvent.click(screen.getByText("CALL"))).not.toThrow();
  });

  it("applies all classNames slots", () => {
    const { container } = render(
      <CompactCallSummary
        frame={SAMPLE()}
        maxDepth={1}
        classNames={{
          root: "tx-root",
          header: "tx-header",
          statusBadge: "tx-status",
          gasTotal: "tx-gas",
          list: "tx-list",
          line: "tx-line",
          typeChip: "tx-type",
          address: "tx-addr",
          selector: "tx-selector",
          revertChip: "tx-revert",
          truncationFooter: "tx-trunc",
        }}
      />,
    );
    for (const c of [
      "tx-root",
      "tx-header",
      "tx-status",
      "tx-gas",
      "tx-list",
      "tx-line",
      "tx-type",
      "tx-addr",
      "tx-revert",
      "tx-trunc",
    ]) {
      expect(container.querySelector(`.${c}`)).not.toBeNull();
    }
  });

  it("applies className and style to root", () => {
    const { container } = render(
      <CompactCallSummary
        frame={makeFrame({})}
        className="outer-class"
        style={{ marginTop: "42px" }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("outer-class");
    expect(root.style.marginTop).toBe("42px");
  });

  it("returns empty className when no slot or override supplied", () => {
    const { container } = render(<CompactCallSummary frame={makeFrame({})} />);
    expect((container.firstChild as HTMLElement).className).toBe("");
  });
});
