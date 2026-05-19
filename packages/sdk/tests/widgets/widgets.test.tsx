import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Address, Hex } from "viem";
import {
  RisksWidget,
  SwapsWidget,
  ApprovalsWidget,
  TokenFlowsWidget,
  EmbedDashboard,
} from "../../src/widgets/index.js";
import { addrs, makeFrame } from "../fixtures.js";
import type { Log, TraceFrame } from "../../src/types.js";

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Log fixtures (Transfer + Approval + UniV2 Swap)
// ---------------------------------------------------------------------------

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const UNIV2_SWAP_TOPIC =
  "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const UINT256_MAX = 2n ** 256n - 1n;

function addrTopic(address: Address): Hex {
  return (`0x000000000000000000000000${address.slice(2)}`).toLowerCase() as Hex;
}

function uint256Hex(n: bigint): Hex {
  return (`0x${n.toString(16).padStart(64, "0")}`) as Hex;
}

function transferLog(from: Address, to: Address, value: bigint): Log {
  return {
    address: addrs.CONTRACT,
    topics: [TRANSFER_TOPIC as Hex, addrTopic(from), addrTopic(to)],
    data: uint256Hex(value),
  };
}

function approvalLog(owner: Address, spender: Address, value: bigint): Log {
  return {
    address: addrs.CONTRACT,
    topics: [APPROVAL_TOPIC as Hex, addrTopic(owner), addrTopic(spender)],
    data: uint256Hex(value),
  };
}

function univ2SwapLog(): Log {
  return {
    address: addrs.VAULT,
    topics: [
      UNIV2_SWAP_TOPIC as Hex,
      addrTopic(addrs.ALICE),
      addrTopic(addrs.BOB),
    ],
    // 4 × uint256: amount0In, amount1In, amount0Out, amount1Out
    data: ("0x" +
      uint256Hex(1n).slice(2) +
      uint256Hex(0n).slice(2) +
      uint256Hex(0n).slice(2) +
      uint256Hex(2n).slice(2)) as Hex,
  };
}

function busyFrame(): TraceFrame {
  // One Transfer (delta), one Approval (unlimited → both ApprovalsPanel
  // badge and LARGE_APPROVAL risk), one UniV2 Swap, and one nested
  // DELEGATECALL (→ DELEGATECALL_UNRECOGNIZED risk). Used by the
  // EmbedDashboard composition tests.
  const child = makeFrame({
    type: "DELEGATECALL",
    from: addrs.CONTRACT,
    to: addrs.VAULT,
    depth: 1,
  });
  const frame: TraceFrame = {
    ...makeFrame({ children: [child] }),
    logs: [
      transferLog(addrs.ALICE, addrs.BOB, 1_000n),
      approvalLog(addrs.ALICE, addrs.BOB, UINT256_MAX),
      univ2SwapLog(),
    ],
  };
  return frame;
}

// ---------------------------------------------------------------------------
// RisksWidget
// ---------------------------------------------------------------------------

describe("RisksWidget", () => {
  it("renders FindingsPanel with risks pulled from analyzeRisks", () => {
    const frame = busyFrame();
    render(<RisksWidget frame={frame} />);
    // FindingsPanel header has the "Findings" label + per-severity badges.
    // Both the DELEGATECALL and LARGE_APPROVAL message texts should appear.
    expect(screen.getByText("Findings")).toBeDefined();
    expect(
      screen.getByText(/DELEGATECALL to non-whitelisted/i),
    ).toBeDefined();
    expect(screen.getByText(/Large ERC-20 approval/i)).toBeDefined();
  });

  it("forwards options to analyzeRisks (whitelist suppresses finding)", () => {
    const frame = busyFrame();
    render(
      <RisksWidget
        frame={frame}
        options={{ whitelist: new Set([addrs.VAULT]) }}
      />,
    );
    // DELEGATECALL flag suppressed → only LARGE_APPROVAL remains.
    expect(screen.queryByText(/DELEGATECALL to non-whitelisted/i)).toBeNull();
    expect(screen.getByText(/Large ERC-20 approval/i)).toBeDefined();
  });

  it("renders 'No risks' for a clean trace", () => {
    render(<RisksWidget frame={makeFrame({})} />);
    expect(screen.getByText(/No risks detected/i)).toBeDefined();
  });

  it("fires onSelect with the index of the clicked finding", () => {
    const calls: number[] = [];
    const frame = busyFrame();
    const { container } = render(
      <RisksWidget frame={frame} onSelect={(i) => calls.push(i)} />,
    );
    // FindingsPanel renders each finding as a div with inline
    // `cursor: pointer` when an onSelect is supplied. Match on that style
    // so we click an actual row (vs. the panel root, which has no handler).
    const rows = container.querySelectorAll<HTMLDivElement>(
      'div[style*="cursor: pointer"]',
    );
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.click(rows[0]);
    // The wrapper in RisksWidget computes the index by re-finding the risk
    // in its memoized analyze result. Just assert the handler ran and
    // produced a numeric index.
    expect(calls).toHaveLength(1);
    expect(typeof calls[0]).toBe("number");
  });

  it("threads classNames, style, and className through to FindingsPanel", () => {
    const { container } = render(
      <RisksWidget
        frame={makeFrame({})}
        className="root-cls"
        style={{ marginTop: 9 }}
        classNames={{ root: "root-2", empty: "ept" }}
        hideHeader
        emptyMessage="Nothing here"
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("root-cls");
    expect(root.className).toContain("root-2");
    expect(screen.getByText("Nothing here")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// SwapsWidget
// ---------------------------------------------------------------------------

describe("SwapsWidget", () => {
  it("renders SwapsPanel populated from parseSwaps", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [univ2SwapLog()],
    };
    render(<SwapsWidget frame={frame} />);
    expect(screen.getByText(/1 swap/i)).toBeDefined();
  });

  it("shows the empty state for a swap-free trace", () => {
    render(<SwapsWidget frame={makeFrame({})} />);
    expect(screen.getByText(/0 swaps/i)).toBeDefined();
  });

  it("supports custom title + hideHeader + theming", () => {
    const { container } = render(
      <SwapsWidget
        frame={makeFrame({})}
        title="Trades"
        className="root-cls"
        classNames={{ root: "root-2" }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("root-cls");
    expect(root.className).toContain("root-2");
    expect(screen.getByText("Trades")).toBeDefined();
  });

  it("hides the header when hideHeader is set", () => {
    render(<SwapsWidget frame={makeFrame({})} hideHeader title="X" />);
    expect(screen.queryByText("X")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ApprovalsWidget
// ---------------------------------------------------------------------------

describe("ApprovalsWidget", () => {
  it("decodes ERC-20 Approvals and renders ApprovalsPanel", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [approvalLog(addrs.ALICE, addrs.BOB, 100n)],
    };
    render(<ApprovalsWidget frame={frame} />);
    expect(screen.getByText("1 approval")).toBeDefined();
    expect(screen.getByText("100")).toBeDefined();
  });

  it("badges UNLIMITED when unlimitedThreshold is crossed", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [approvalLog(addrs.ALICE, addrs.BOB, 2n ** 128n)],
    };
    render(
      <ApprovalsWidget frame={frame} unlimitedThreshold={2n ** 128n} />,
    );
    expect(screen.getByText("UNLIMITED")).toBeDefined();
  });

  it("propagates hideHeader, title, classNames, style, className", () => {
    const { container } = render(
      <ApprovalsWidget
        frame={makeFrame({})}
        hideHeader
        title="Allowances"
        className="root-cls"
        style={{ borderColor: "red" }}
        classNames={{ root: "root-2", empty: "ept" }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("root-cls");
    expect(root.className).toContain("root-2");
    expect(screen.queryByText("Allowances")).toBeNull();
  });

  it("shows the empty state for a no-approvals trace", () => {
    render(<ApprovalsWidget frame={makeFrame({})} />);
    expect(screen.getByText(/No approvals/)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TokenFlowsWidget
// ---------------------------------------------------------------------------

describe("TokenFlowsWidget", () => {
  it("decodes Transfer events and renders TokenDeltasPanel", () => {
    const frame: TraceFrame = {
      ...makeFrame({}),
      logs: [transferLog(addrs.ALICE, addrs.BOB, 42n)],
    };
    render(<TokenFlowsWidget frame={frame} />);
    expect(screen.getByText("1 transfer")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
  });

  it("renders the empty state when there are no transfers", () => {
    render(<TokenFlowsWidget frame={makeFrame({})} />);
    expect(screen.getByText(/No token transfers/)).toBeDefined();
  });

  it("forwards theming + title + hideHeader", () => {
    const { container } = render(
      <TokenFlowsWidget
        frame={makeFrame({})}
        title="ERC-20 Flows"
        hideHeader
        className="root-cls"
        style={{ marginTop: 9 }}
        classNames={{ root: "root-2", row: "rw", amount: "amt" }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("root-cls");
    expect(root.className).toContain("root-2");
    expect(screen.queryByText("ERC-20 Flows")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// EmbedDashboard
// ---------------------------------------------------------------------------

describe("EmbedDashboard", () => {
  it("renders four tabs with counts when frame has data in each bucket", () => {
    render(<EmbedDashboard frame={busyFrame()} />);
    // The labels and the count badges should both render.
    expect(screen.getByRole("tab", { name: /Risks/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Swaps/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Approvals/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Transfers/i })).toBeDefined();
  });

  it("defaults to the first non-empty tab when defaultTab is omitted", () => {
    // Risks comes first in `allTabs` and has 2 findings → default selection.
    render(<EmbedDashboard frame={busyFrame()} />);
    const risksTab = screen.getByRole("tab", { name: /Risks/i });
    expect(risksTab.getAttribute("aria-selected")).toBe("true");
  });

  it("respects an explicit defaultTab when it is visible", () => {
    render(<EmbedDashboard frame={busyFrame()} defaultTab="swaps" />);
    expect(
      screen.getByRole("tab", { name: /Swaps/i }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("ignores defaultTab when it is in hideTabs", () => {
    render(
      <EmbedDashboard
        frame={busyFrame()}
        defaultTab="swaps"
        hideTabs={["swaps"]}
      />,
    );
    expect(screen.queryByRole("tab", { name: /Swaps/i })).toBeNull();
    // Falls back to the first non-empty visible tab → Risks.
    expect(
      screen.getByRole("tab", { name: /Risks/i }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("falls back to the first visible tab when no bucket has data", () => {
    render(<EmbedDashboard frame={makeFrame({})} />);
    // All counts are zero. The fallback is still the first visible tab.
    expect(
      screen.getByRole("tab", { name: /Risks/i }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("switches tabs on click", () => {
    render(<EmbedDashboard frame={busyFrame()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Approvals/i }));
    expect(
      screen.getByRole("tab", { name: /Approvals/i }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("renders the swaps panel when swaps tab is active", () => {
    render(<EmbedDashboard frame={busyFrame()} defaultTab="swaps" />);
    // SwapsPanel's count text — disambiguates from the tab badge by matching
    // the trailing 'swap' word.
    expect(screen.getByText(/1 swap$/i)).toBeDefined();
  });

  it("renders the approvals panel when approvals tab is active", () => {
    render(<EmbedDashboard frame={busyFrame()} defaultTab="approvals" />);
    expect(screen.getByText("UNLIMITED")).toBeDefined();
  });

  it("renders the transfers panel when transfers tab is active", () => {
    render(<EmbedDashboard frame={busyFrame()} defaultTab="transfers" />);
    expect(screen.getByText(/1 transfer$/i)).toBeDefined();
  });

  it("hides individually-listed tabs entirely", () => {
    render(
      <EmbedDashboard
        frame={busyFrame()}
        hideTabs={["risks", "transfers"]}
      />,
    );
    expect(screen.queryByRole("tab", { name: /Risks/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Transfers/i })).toBeNull();
    expect(screen.getByRole("tab", { name: /Swaps/i })).toBeDefined();
  });

  it("threads classNames + style + className through the wrapper", () => {
    const { container } = render(
      <EmbedDashboard
        frame={makeFrame({})}
        className="root-cls"
        style={{ marginTop: 17 }}
        classNames={{
          root: "root-2",
          tabs: "tbs",
          tab: "tb",
          tabActive: "tba",
          count: "cnt",
          panel: "pnl",
        }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("root-cls");
    expect(root.className).toContain("root-2");
    expect(container.querySelector(".tbs")).not.toBeNull();
    expect(container.querySelector(".tb")).not.toBeNull();
    expect(container.querySelector(".tba")).not.toBeNull();
    expect(container.querySelector(".pnl")).not.toBeNull();
  });

  it("renders a count badge only when the bucket is non-empty", () => {
    render(<EmbedDashboard frame={makeFrame({})} />);
    // No counts > 0 → no badge spans should render. We assert by checking
    // that the tab labels render plainly without an adjacent digit.
    const risksTab = screen.getByRole("tab", { name: /Risks/i });
    expect(risksTab.textContent).toMatch(/^Risks$/);
  });

  it("falls back to risks when every tab is hidden", () => {
    // Defensive: with no visible tabs the dashboard still renders without
    // throwing. The initialTab resolution path takes the `?? 'risks'` branch.
    const { container } = render(
      <EmbedDashboard
        frame={makeFrame({})}
        hideTabs={["risks", "swaps", "approvals", "transfers"]}
      />,
    );
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0);
  });
});
