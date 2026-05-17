import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { GasFlamegraph } from "../../src/components/GasFlamegraph.js";
import { addrs, makeFrame } from "../fixtures.js";

afterEach(() => cleanup());

function tree() {
  return makeFrame({
    from: addrs.ALICE,
    to: addrs.CONTRACT,
    gasUsed: 100_000n,
    input: "0xdeadbeef",
    children: [
      makeFrame({
        type: "STATICCALL",
        from: addrs.CONTRACT,
        to: addrs.VAULT,
        gasUsed: 30_000n,
        input: "0x70a08231",
        functionName: "balanceOf",
        depth: 1,
      }),
      makeFrame({
        type: "DELEGATECALL",
        from: addrs.CONTRACT,
        to: addrs.BOB,
        gasUsed: 20_000n,
        input: "0xa9059cbb",
        functionName: "transfer",
        depth: 1,
      }),
    ],
  });
}

describe("GasFlamegraph", () => {
  it("renders the header with total gas", () => {
    render(<GasFlamegraph frame={tree()} />);
    expect(screen.getByText("Gas Flamegraph")).toBeDefined();
    expect(screen.getByText(/100,000 gas total/)).toBeDefined();
  });

  it("hides the header when hideHeader=true", () => {
    render(<GasFlamegraph frame={tree()} hideHeader />);
    expect(screen.queryByText("Gas Flamegraph")).toBeNull();
  });

  it("hides the legend when hideLegend=true", () => {
    const { container } = render(
      <GasFlamegraph frame={tree()} hideLegend />,
    );
    // Legend renders a CREATE chip — absent when hidden
    expect(container.textContent).not.toContain("CREATE");
  });

  it("renders a bar per visible frame with the resolved label", () => {
    render(<GasFlamegraph frame={tree()} hideLegend />);
    expect(screen.getByText("balanceOf")).toBeDefined();
    expect(screen.getByText("transfer")).toBeDefined();
  });

  it("fires onSelect with the clicked frame", () => {
    const onSelect = vi.fn();
    const t = tree();
    render(<GasFlamegraph frame={t} onSelect={onSelect} hideLegend />);
    fireEvent.click(screen.getByText("balanceOf"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toBe(t.children[0]);
  });

  it("shows a tooltip on hover and hides it on leave", () => {
    render(<GasFlamegraph frame={tree()} hideLegend />);
    expect(screen.queryByText(/type:/)).toBeNull();
    // Cache the bar reference before hover — the tooltip also contains the
    // word "balanceOf" once shown, so getByText becomes ambiguous afterward.
    const bar = screen.getByText("balanceOf");
    fireEvent.mouseEnter(bar);
    expect(screen.getByText("type: STATICCALL")).toBeDefined();
    fireEvent.mouseLeave(bar);
    expect(screen.queryByText("type: STATICCALL")).toBeNull();
  });

  it("includes the `to` field in the tooltip when present", () => {
    render(<GasFlamegraph frame={tree()} hideLegend />);
    fireEvent.mouseEnter(screen.getByText("balanceOf"));
    expect(screen.getByText(/to: 0xdddd/)).toBeDefined();
  });

  it("shows error in tooltip for reverted frames", () => {
    const t = makeFrame({
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gasUsed: 50_000n,
      input: "0x",
      error: "out of gas",
      functionName: "doStuff",
    });
    render(<GasFlamegraph frame={t} hideLegend />);
    fireEvent.mouseEnter(screen.getByText("doStuff"));
    expect(screen.getByText(/out of gas/)).toBeDefined();
  });

  it("respects minBarWidth — bars below the threshold are not drawn", () => {
    // A child taking 0.1% of root gas falls below the default 0.3% threshold
    const t = makeFrame({
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gasUsed: 100_000n,
      children: [
        makeFrame({
          type: "STATICCALL",
          from: addrs.CONTRACT,
          to: addrs.VAULT,
          gasUsed: 100n, // 0.1% — should be hidden
          input: "0x70a08231",
          functionName: "tinyCall",
          depth: 1,
        }),
      ],
    });
    render(<GasFlamegraph frame={t} hideLegend />);
    expect(screen.queryByText("tinyCall")).toBeNull();
  });

  it("custom minBarWidth=0 shows even sub-pixel bars", () => {
    const t = makeFrame({
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gasUsed: 100_000n,
      children: [
        makeFrame({
          type: "STATICCALL",
          from: addrs.CONTRACT,
          to: addrs.VAULT,
          gasUsed: 100n,
          input: "0x",
          functionName: "tinyCall",
          depth: 1,
        }),
      ],
    });
    render(<GasFlamegraph frame={t} minBarWidth={0} hideLegend />);
    // Bar exists in DOM (label is empty for narrow bars but the element is there)
    // The presence of mouseable elements covers the render path.
    const bars = document.querySelectorAll("div[style*='position: absolute']");
    expect(bars.length).toBeGreaterThan(1);
  });

  it("omits labels for bars too narrow to display text (width <= 3%)", () => {
    const t = makeFrame({
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gasUsed: 100_000n,
      children: [
        makeFrame({
          type: "STATICCALL",
          from: addrs.CONTRACT,
          to: addrs.VAULT,
          gasUsed: 2_000n, // 2%
          input: "0x",
          functionName: "narrow",
          depth: 1,
        }),
      ],
    });
    render(<GasFlamegraph frame={t} hideLegend />);
    // narrow bar's label is empty in the DOM
    expect(screen.queryByText("narrow")).toBeNull();
  });

  it("respects custom barHeight", () => {
    const { container } = render(
      <GasFlamegraph frame={tree()} barHeight={40} hideLegend hideHeader />,
    );
    // Chart height = (maxDepth + 1) * barHeight + 4 = 2 * 40 + 4 = 84
    const chart = container.querySelector("[style*='position: relative']") as HTMLElement;
    expect(chart.style.height).toBe("84px");
  });

  it("applies className and classNames.root", () => {
    const { container } = render(
      <GasFlamegraph
        frame={tree()}
        className="my-fg"
        classNames={{ root: "extra" }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("my-fg");
    expect(root.className).toContain("extra");
  });

  it("uses resolveSelector to label calls without functionName", () => {
    const t = makeFrame({
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gasUsed: 50_000n,
      input: "0xa9059cbb",
    });
    render(
      <GasFlamegraph
        frame={t}
        resolveSelector={(sel) => (sel === "0xa9059cbb" ? "transfer" : undefined)}
        hideLegend
      />,
    );
    expect(screen.getByText("transfer")).toBeDefined();
  });

  it("uses default cursor when no onSelect is given", () => {
    render(<GasFlamegraph frame={tree()} hideLegend />);
    const bar = screen.getByText("balanceOf");
    expect((bar as HTMLElement).style.cursor).toBe("default");
  });

  it("updates tooltip position as the mouse moves over the chart", () => {
    const { container } = render(
      <GasFlamegraph frame={tree()} hideLegend hideHeader />,
    );
    const chart = container.querySelector(
      "[style*='position: relative']",
    ) as HTMLElement;
    fireEvent.mouseEnter(screen.getByText("balanceOf"));
    fireEvent.mouseMove(chart, { clientX: 100, clientY: 200 });
    const tooltip = container.querySelector(
      "[style*='position: fixed']",
    ) as HTMLElement;
    expect(tooltip.style.left).toBe("112px"); // 100 + 12
    expect(tooltip.style.top).toBe("160px"); // 200 - 40
  });
});
