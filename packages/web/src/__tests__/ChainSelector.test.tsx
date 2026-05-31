import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChainSelector } from "../components/ChainSelector";
import { ALL_CHAINS } from "../lib/chains";

/**
 * Smoke tests for the chain picker. Verifies the closed / open states,
 * the "All chains" sentinel, and that selecting a row calls onChange
 * with the right chain id.
 */

describe("<ChainSelector />", () => {
  it("renders 'All chains' when value is the ALL_CHAINS sentinel", () => {
    render(<ChainSelector value={ALL_CHAINS} onChange={() => {}} variant="full" />);
    expect(screen.getByText("All chains")).toBeInTheDocument();
  });

  it("renders the chain's name when value is a real chain id", () => {
    render(<ChainSelector value={369} onChange={() => {}} variant="full" />);
    expect(screen.getByText("PulseChain")).toBeInTheDocument();
  });

  it("opens a menu listing every registered chain on click", () => {
    render(<ChainSelector value={ALL_CHAINS} onChange={() => {}} variant="full" />);
    fireEvent.click(screen.getByRole("button"));
    // Menu rows include the three launch-set chains plus the "All chains" row
    expect(screen.getAllByText("All chains").length).toBeGreaterThan(0);
    expect(screen.getByText("Ethereum")).toBeInTheDocument();
    expect(screen.getByText("PulseChain")).toBeInTheDocument();
    expect(screen.getByText("PulseChain Testnet")).toBeInTheDocument();
  });

  it("clicking a chain row calls onChange with that chain's id", () => {
    const onChange = vi.fn();
    render(<ChainSelector value={ALL_CHAINS} onChange={onChange} variant="full" />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Ethereum"));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("clicking the 'All chains' row in the menu calls onChange(ALL_CHAINS)", () => {
    const onChange = vi.fn();
    render(<ChainSelector value={369} onChange={onChange} variant="full" />);
    fireEvent.click(screen.getByRole("button"));
    // There are two "All chains" texts now (the trigger + the row). Click the
    // menu row specifically by selecting the one with the sublabel sibling.
    const rows = screen.getAllByText("All chains");
    // The trigger button text is the first occurrence; the menu row is later.
    fireEvent.click(rows[rows.length - 1]!);
    expect(onChange).toHaveBeenCalledWith(ALL_CHAINS);
  });

  it("marks the testnet entry with its 'testnet' sublabel", () => {
    render(<ChainSelector value={ALL_CHAINS} onChange={() => {}} variant="full" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/chain 943 · testnet/i)).toBeInTheDocument();
  });
});
