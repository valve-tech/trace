import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ApprovalsPanel } from "../../src/components/ApprovalsPanel.js";
import { addrs } from "../fixtures.js";
import type { TokenApproval } from "../../src/types.js";

afterEach(() => cleanup());

const UINT256_MAX = 2n ** 256n - 1n;

function approval(overrides: Partial<TokenApproval> = {}): TokenApproval {
  return {
    token: addrs.CONTRACT,
    owner: addrs.ALICE,
    spender: addrs.BOB,
    value: 1_000n,
    logIndex: 0,
    ...overrides,
  };
}

describe("ApprovalsPanel — empty", () => {
  it("renders the empty hint and singular/plural count", () => {
    render(<ApprovalsPanel approvals={[]} />);
    expect(screen.getByText("Approvals")).toBeDefined();
    expect(screen.getByText("0 approvals")).toBeDefined();
    expect(screen.getByText(/No approvals in this trace/)).toBeDefined();
  });
});

describe("ApprovalsPanel — populated", () => {
  it("renders a single approval row with owner / spender / value", () => {
    render(<ApprovalsPanel approvals={[approval()]} />);
    expect(screen.getByText("1 approval")).toBeDefined();
    expect(screen.getByText("owner")).toBeDefined();
    expect(screen.getByText("spender")).toBeDefined();
    expect(screen.getByText("1000")).toBeDefined();
  });

  it("shows the UNLIMITED badge and ∞ value when value === uint256.max", () => {
    render(<ApprovalsPanel approvals={[approval({ value: UINT256_MAX })]} />);
    expect(screen.getByText("UNLIMITED")).toBeDefined();
    expect(screen.getByText("∞")).toBeDefined();
  });

  it("hides UNLIMITED badge when value is below the default threshold", () => {
    render(
      <ApprovalsPanel
        approvals={[approval({ value: UINT256_MAX - 1n })]}
      />,
    );
    expect(screen.queryByText("UNLIMITED")).toBeNull();
  });

  it("respects a lowered unlimitedThreshold", () => {
    render(
      <ApprovalsPanel
        approvals={[approval({ value: 2n ** 128n })]}
        unlimitedThreshold={2n ** 128n}
      />,
    );
    expect(screen.getByText("UNLIMITED")).toBeDefined();
  });

  it("renders multiple rows with stable order", () => {
    render(
      <ApprovalsPanel
        approvals={[
          approval({ value: 1n, logIndex: 0 }),
          approval({ value: UINT256_MAX, logIndex: 1 }),
        ]}
      />,
    );
    expect(screen.getByText("2 approvals")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("∞")).toBeDefined();
  });
});

describe("ApprovalsPanel — theming", () => {
  it("respects hideHeader", () => {
    render(<ApprovalsPanel approvals={[approval()]} hideHeader />);
    expect(screen.queryByText("Approvals")).toBeNull();
  });

  it("uses a custom title", () => {
    render(<ApprovalsPanel approvals={[]} title="ERC-20 approvals" />);
    expect(screen.getByText("ERC-20 approvals")).toBeDefined();
  });

  it("composes className + classNames.root", () => {
    const { container } = render(
      <ApprovalsPanel
        approvals={[]}
        className="outer"
        classNames={{ root: "themed" }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("outer");
    expect(root.className).toContain("themed");
  });

  it("applies classNames.unlimitedBadge", () => {
    render(
      <ApprovalsPanel
        approvals={[approval({ value: UINT256_MAX })]}
        classNames={{ unlimitedBadge: "badge-themed" }}
      />,
    );
    expect(screen.getByText("UNLIMITED").className).toContain("badge-themed");
  });
});
