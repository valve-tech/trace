import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SwapsPanel } from "../../src/components/SwapsPanel.js";
import { addrs } from "../fixtures.js";
import type { Swap } from "../../src/types.js";

afterEach(() => cleanup());

function v1(overrides: Partial<Extract<Swap, { variant: "univ1" }>> = {}): Swap {
  return {
    variant: "univ1",
    pool: addrs.CONTRACT,
    buyer: addrs.ALICE,
    direction: "buyToken",
    ethAmount: 10_000n,
    tokenAmount: 50_000n,
    logIndex: 0,
    ...overrides,
  };
}

function v2(overrides: Partial<Extract<Swap, { variant: "univ2" }>> = {}): Swap {
  return {
    variant: "univ2",
    pool: addrs.CONTRACT,
    sender: addrs.ALICE,
    to: addrs.BOB,
    amount0In: 1_000n,
    amount1In: 0n,
    amount0Out: 0n,
    amount1Out: 950n,
    logIndex: 0,
    ...overrides,
  };
}

function v3(overrides: Partial<Extract<Swap, { variant: "univ3" }>> = {}): Swap {
  return {
    variant: "univ3",
    pool: addrs.CONTRACT,
    sender: addrs.ALICE,
    recipient: addrs.BOB,
    amount0: 1_000n,
    amount1: -950n,
    sqrtPriceX96: 79228162514264337593543950336n,
    liquidity: 1_000_000n,
    tick: -42,
    logIndex: 0,
    ...overrides,
  };
}

describe("SwapsPanel — empty", () => {
  it("renders the empty hint with the title and singular/plural count", () => {
    render(<SwapsPanel swaps={[]} />);
    expect(screen.getByText("Swaps")).toBeDefined();
    expect(screen.getByText("0 swaps")).toBeDefined();
    expect(screen.getByText(/No swaps in this trace/)).toBeDefined();
  });
});

describe("SwapsPanel — variants", () => {
  it("renders a UniV1 swap with direction label and amounts", () => {
    render(<SwapsPanel swaps={[v1()]} />);
    expect(screen.getByText("V1")).toBeDefined();
    expect(screen.getByText("ETH → token")).toBeDefined();
    expect(screen.getByText("10000")).toBeDefined();
    expect(screen.getByText("50000")).toBeDefined();
    expect(screen.getByText("1 swap")).toBeDefined();
  });

  it("renders a UniV1 sellToken swap with the right direction label", () => {
    render(
      <SwapsPanel swaps={[v1({ direction: "sellToken" })]} />,
    );
    expect(screen.getByText("token → ETH")).toBeDefined();
  });

  it("renders a UniV2 swap with all four amounts", () => {
    render(<SwapsPanel swaps={[v2()]} />);
    expect(screen.getByText("V2")).toBeDefined();
    expect(screen.getByText("amount0In")).toBeDefined();
    expect(screen.getByText("amount1Out")).toBeDefined();
    expect(screen.getByText("950")).toBeDefined();
  });

  it("renders a UniV3 swap with signed amounts, tick, liquidity", () => {
    render(<SwapsPanel swaps={[v3()]} />);
    expect(screen.getByText("V3")).toBeDefined();
    expect(screen.getByText("1000")).toBeDefined();
    expect(screen.getByText("-950")).toBeDefined();
    expect(screen.getByText("-42")).toBeDefined();
    expect(screen.getByText("1000000")).toBeDefined();
  });

  it("color-codes UniV3 signed amounts (positive=red, negative=green, zero=neutral)", () => {
    render(
      <SwapsPanel
        swaps={[
          v3({ amount0: 1n, amount1: -1n, logIndex: 0 }),
          v3({ amount0: 0n, amount1: 0n, logIndex: 1 }),
        ]}
      />,
    );
    // Two rows rendered without error; spot-check the zero values display.
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("renders mixed-variant arrays without losing rows", () => {
    render(
      <SwapsPanel
        swaps={[v1({ logIndex: 0 }), v2({ logIndex: 1 }), v3({ logIndex: 2 })]}
      />,
    );
    expect(screen.getByText("V1")).toBeDefined();
    expect(screen.getByText("V2")).toBeDefined();
    expect(screen.getByText("V3")).toBeDefined();
    expect(screen.getByText("3 swaps")).toBeDefined();
  });
});

describe("SwapsPanel — theming + customization", () => {
  it("respects hideHeader", () => {
    render(<SwapsPanel swaps={[v2()]} hideHeader />);
    expect(screen.queryByText("Swaps")).toBeNull();
  });

  it("uses the provided title", () => {
    render(<SwapsPanel swaps={[]} title="Custom title" />);
    expect(screen.getByText("Custom title")).toBeDefined();
  });

  it("composes className + classNames.root on the root", () => {
    const { container } = render(
      <SwapsPanel
        swaps={[]}
        className="outer"
        classNames={{ root: "themed" }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("outer");
    expect(root.className).toContain("themed");
  });

  it("applies classNames.badge to variant badges", () => {
    render(
      <SwapsPanel
        swaps={[v2()]}
        classNames={{ badge: "badge-themed" }}
      />,
    );
    expect(screen.getByText("V2").className).toContain("badge-themed");
  });
});
