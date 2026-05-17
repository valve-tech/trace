import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { FindingsPanel } from "../../src/components/FindingsPanel.js";
import type { RiskFlag, RiskSeverity } from "../../src/types.js";
import type { Address } from "viem";

afterEach(() => cleanup());

const ADDR = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;

function flag(overrides: Partial<RiskFlag> = {}): RiskFlag {
  return {
    type: "DELEGATECALL_UNRECOGNIZED",
    severity: "danger" as RiskSeverity,
    message: "DELEGATECALL to non-whitelisted address",
    address: ADDR,
    depth: 1,
    childIndex: 0,
    reverted: false,
    ...overrides,
  };
}

describe("FindingsPanel", () => {
  it("renders the empty state when risks is empty", () => {
    render(<FindingsPanel risks={[]} />);
    expect(screen.getByText("No risks detected.")).toBeDefined();
  });

  it("uses custom emptyMessage when supplied", () => {
    render(<FindingsPanel risks={[]} emptyMessage="All clear, captain." />);
    expect(screen.getByText("All clear, captain.")).toBeDefined();
  });

  it("renders the header with severity counts by default", () => {
    render(<FindingsPanel risks={[]} />);
    // Default header shows counts for all three severities
    expect(screen.getByText(/DANGER 0/)).toBeDefined();
    expect(screen.getByText(/WARN 0/)).toBeDefined();
    expect(screen.getByText(/INFO 0/)).toBeDefined();
    expect(screen.getByText("Findings")).toBeDefined();
  });

  it("hides the header when hideHeader=true", () => {
    render(<FindingsPanel risks={[]} hideHeader />);
    expect(screen.queryByText("Findings")).toBeNull();
  });

  it("renders a single finding with type, message, address, location", () => {
    render(<FindingsPanel risks={[flag()]} />);
    expect(screen.getByText("DELEGATECALL_UNRECOGNIZED")).toBeDefined();
    expect(
      screen.getByText("DELEGATECALL to non-whitelisted address"),
    ).toBeDefined();
    // truncated address (0xaaaa…aaaa shape from truncateAddress)
    expect(screen.getByText(/0x.*\.\.\..*aaaa/i)).toBeDefined();
    // location indicator d{depth}.{childIndex}
    expect(screen.getByText("d1.0")).toBeDefined();
  });

  it("renders findings grouped by severity, danger first", () => {
    const risks = [
      flag({ severity: "info", message: "info msg" }),
      flag({ severity: "danger", message: "danger msg" }),
      flag({ severity: "warning", message: "warn msg" }),
    ];
    const { container } = render(<FindingsPanel risks={risks} hideHeader />);
    const text = container.textContent ?? "";
    const dangerIdx = text.indexOf("danger msg");
    const warnIdx = text.indexOf("warn msg");
    const infoIdx = text.indexOf("info msg");
    expect(dangerIdx).toBeGreaterThan(-1);
    expect(warnIdx).toBeGreaterThan(dangerIdx);
    expect(infoIdx).toBeGreaterThan(warnIdx);
  });

  it("does not render the address span when address is null", () => {
    const { container } = render(
      <FindingsPanel
        risks={[flag({ address: null, message: "missing addr finding" })]}
        hideHeader
      />,
    );
    // The address slot is the only thing that would render `0x` text in this minimal case.
    expect(container.textContent).not.toMatch(/0x[a-f0-9]{4}/i);
  });

  it("invokes onSelect when a finding is clicked", () => {
    const handler = vi.fn();
    const f = flag();
    render(<FindingsPanel risks={[f]} onSelect={handler} hideHeader />);
    fireEvent.click(screen.getByText("DELEGATECALL_UNRECOGNIZED"));
    expect(handler).toHaveBeenCalledWith(f);
  });

  it("does not crash when no onSelect is provided and a row is clicked", () => {
    render(<FindingsPanel risks={[flag()]} hideHeader />);
    expect(() =>
      fireEvent.click(screen.getByText("DELEGATECALL_UNRECOGNIZED")),
    ).not.toThrow();
  });

  it("applies classNames slots to root, header, list, findingRow, slots", () => {
    const { container } = render(
      <FindingsPanel
        risks={[flag()]}
        classNames={{
          root: "tx-root",
          header: "tx-header",
          list: "tx-list",
          findingRow: "tx-row",
          severityBadge: "tx-badge",
          typeChip: "tx-chip",
          message: "tx-msg",
          address: "tx-addr",
          location: "tx-loc",
        }}
      />,
    );
    expect(container.querySelector(".tx-root")).not.toBeNull();
    expect(container.querySelector(".tx-header")).not.toBeNull();
    expect(container.querySelector(".tx-list")).not.toBeNull();
    expect(container.querySelector(".tx-row")).not.toBeNull();
    expect(container.querySelector(".tx-badge")).not.toBeNull();
    expect(container.querySelector(".tx-chip")).not.toBeNull();
    expect(container.querySelector(".tx-msg")).not.toBeNull();
    expect(container.querySelector(".tx-addr")).not.toBeNull();
    expect(container.querySelector(".tx-loc")).not.toBeNull();
  });

  it("applies the empty-state classNames slot", () => {
    const { container } = render(
      <FindingsPanel risks={[]} classNames={{ empty: "tx-empty" }} />,
    );
    expect(container.querySelector(".tx-empty")).not.toBeNull();
  });

  it("applies className and style to root", () => {
    const { container } = render(
      <FindingsPanel
        risks={[]}
        className="outer-class"
        style={{ marginTop: "42px" }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("outer-class");
    expect(root.style.marginTop).toBe("42px");
  });

  it("falls back to undefined className when neither classNames.root nor className supplied", () => {
    // Covers the .filter(Boolean).join(" ") || undefined branch
    const { container } = render(<FindingsPanel risks={[]} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toBe("");
  });
});
