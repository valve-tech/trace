import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ForkChainBadge } from "../components/testnets/ForkChainBadge";

/**
 * The badge resolves a fork's `chainId` against the launch-set registry,
 * falling back to PulseChain for legacy forks (no chainId) and to a numeric
 * `Chain N` label for ids the UI registry doesn't know.
 */
describe("ForkChainBadge", () => {
  it("labels a known chain by name", () => {
    const { getByText } = render(<ForkChainBadge chainId={943} />);
    expect(getByText("PulseChain Testnet v4")).toBeTruthy();
  });

  it("defaults to PulseChain when chainId is undefined", () => {
    const { getByText } = render(<ForkChainBadge />);
    expect(getByText("PulseChain")).toBeTruthy();
  });

  it("falls back to a numeric label for an unregistered chain", () => {
    const { getByText } = render(<ForkChainBadge chainId={8453} />);
    expect(getByText("Chain 8453")).toBeTruthy();
  });
});
