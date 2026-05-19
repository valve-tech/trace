import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TokenDeltasPanel } from "../../src/components/TokenDeltasPanel.js";
import { addrs } from "../fixtures.js";
import type { TokenDelta } from "../../src/types.js";

afterEach(() => cleanup());

function delta(overrides: Partial<TokenDelta> = {}): TokenDelta {
  return {
    token: addrs.CONTRACT,
    from: addrs.ALICE,
    to: addrs.BOB,
    value: 1_000n,
    logIndex: 0,
    ...overrides,
  };
}

describe("TokenDeltasPanel — empty", () => {
  it("renders the empty hint and zero-count header", () => {
    render(<TokenDeltasPanel deltas={[]} />);
    expect(screen.getByText("Token Transfers")).toBeDefined();
    expect(screen.getByText("0 transfers")).toBeDefined();
    expect(screen.getByText(/No token transfers/)).toBeDefined();
  });
});

describe("TokenDeltasPanel — populated", () => {
  it("renders one row per delta with from / to / value", () => {
    render(<TokenDeltasPanel deltas={[delta()]} />);
    expect(screen.getByText("1 transfer")).toBeDefined();
    expect(screen.getByText("from")).toBeDefined();
    expect(screen.getByText("to")).toBeDefined();
    expect(screen.getByText("1000")).toBeDefined();
  });

  it("uses plural 'transfers' for multi-row", () => {
    render(
      <TokenDeltasPanel
        deltas={[
          delta({ value: 1n, logIndex: 0 }),
          delta({ value: 2n, logIndex: 1 }),
        ]}
      />,
    );
    expect(screen.getByText("2 transfers")).toBeDefined();
  });

  it("renders the raw bigint value as a string (no decimal formatting)", () => {
    // Deliberate: the parser doesn't know decimals, so the panel mustn't
    // either. Consumers wanting decimals must map first.
    render(
      <TokenDeltasPanel
        deltas={[delta({ value: 123_456_789_000_000_000_000n })]}
      />,
    );
    expect(screen.getByText("123456789000000000000")).toBeDefined();
  });
});

describe("TokenDeltasPanel — toggles + theming", () => {
  it("hides the header when hideHeader is set", () => {
    render(
      <TokenDeltasPanel deltas={[delta()]} hideHeader title="Custom title" />,
    );
    expect(screen.queryByText("Custom title")).toBeNull();
    expect(screen.queryByText("1 transfer")).toBeNull();
  });

  it("honors a custom title", () => {
    render(<TokenDeltasPanel deltas={[]} title="ERC-20 Flows" />);
    expect(screen.getByText("ERC-20 Flows")).toBeDefined();
  });

  it("threads classNames + className + style into the right slots", () => {
    const { container } = render(
      <TokenDeltasPanel
        deltas={[delta()]}
        className="root-cls"
        style={{ marginTop: 17 }}
        classNames={{
          root: "root-2",
          header: "hdr",
          row: "rw",
          amount: "amt",
          empty: "ept",
        }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("root-cls");
    expect(root.className).toContain("root-2");
    expect(container.querySelector(".hdr")).not.toBeNull();
    expect(container.querySelector(".rw")).not.toBeNull();
    expect(container.querySelector(".amt")).not.toBeNull();
  });

  it("applies the empty-slot className when there are no deltas", () => {
    const { container } = render(
      <TokenDeltasPanel deltas={[]} classNames={{ empty: "ept" }} />,
    );
    expect(container.querySelector(".ept")).not.toBeNull();
  });
});
