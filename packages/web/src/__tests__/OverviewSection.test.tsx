import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./_test-utils";
import { OverviewSection } from "../components/explorer/TxDetail/OverviewSection";
import type { TransactionDetails } from "../api/explorer";

/**
 * The transaction overview has two shapes: a mined tx (status + block + gas
 * used) and a pending tx (no receipt yet). The pending shape must not render
 * receipt-derived data that doesn't exist — a NaN block link from the "pending"
 * sentinel, or a misleading "0 / limit" gas row.
 */

function tx(overrides: Partial<TransactionDetails> = {}): TransactionDetails {
  return {
    hash: "0x" + "ab".repeat(32),
    blockNumber: "12345678",
    blockHash: "0x" + "cd".repeat(32),
    transactionIndex: 0,
    from: "0x" + "11".repeat(20),
    to: "0x" + "22".repeat(20),
    value: "1000000000000000000",
    valuePLS: "1",
    gas: "21000",
    gasPrice: "1000000000",
    gasUsed: "21000",
    effectiveGasPrice: "1000000000",
    nonce: 7,
    input: "0x",
    status: "success",
    timestamp: Math.floor(Date.now() / 1000),
    decodedInput: null,
    decodedLogs: [],
    rawLogs: [],
    internalTransactions: [],
    tokenTransfers: [],
    contractAddress: null,
    cumulativeGasUsed: "21000",
    type: "legacy",
    ...overrides,
  };
}

describe("<OverviewSection /> — mined tx", () => {
  it("shows Success, a linked block number, and the gas used/limit row", () => {
    renderWithProviders(<OverviewSection tx={tx()} onNavigate={vi.fn()} />);
    expect(screen.getByText("Success")).toBeInTheDocument();
    expect(screen.getByText("12,345,678")).toBeInTheDocument();
    expect(screen.getByText("Gas Used / Limit")).toBeInTheDocument();
    expect(screen.queryByText("Gas Limit")).not.toBeInTheDocument();
  });
});

describe("<OverviewSection /> — pending tx", () => {
  const pending = tx({
    status: "pending",
    blockNumber: "pending",
    blockHash: "",
    gasUsed: "0",
    effectiveGasPrice: "0",
    cumulativeGasUsed: "0",
    timestamp: null,
  });

  it("shows Pending (badge + block + timestamp), never Success/Reverted", () => {
    renderWithProviders(<OverviewSection tx={pending} onNavigate={vi.fn()} />);
    // "Pending" appears in the status badge, the block row, and the timestamp.
    expect(screen.getAllByText("Pending").length).toBe(3);
    expect(screen.queryByText("Success")).not.toBeInTheDocument();
    expect(screen.queryByText("Reverted")).not.toBeInTheDocument();
  });

  it("does not render a NaN block link — shows Pending, no number", () => {
    renderWithProviders(<OverviewSection tx={pending} onNavigate={vi.fn()} />);
    // "pending" sentinel must never reach Number().toLocaleString()
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
  });

  it("shows a Gas Limit row instead of the misleading 0 / limit used row", () => {
    renderWithProviders(<OverviewSection tx={pending} onNavigate={vi.fn()} />);
    expect(screen.getByText("Gas Limit")).toBeInTheDocument();
    expect(screen.queryByText("Gas Used / Limit")).not.toBeInTheDocument();
    // the gas limit value still renders
    expect(screen.getByText("21,000")).toBeInTheDocument();
  });
});
