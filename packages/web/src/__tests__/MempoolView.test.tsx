import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "./_test-utils";
import type { MempoolPending, PendingTx } from "../api/mempool";

/**
 * Component-level tests for MempoolView. Asserts that the extracted
 * filter/sort pipeline (MempoolView/sort.ts) and gwei formatter
 * (MempoolView/formatters.ts) are wired through to the rendered UI —
 * the unit tests prove the pure logic; these prove the wiring.
 *
 * The api/mempool module is mocked so the component sees deterministic
 * data; useTrackedTxs is stubbed empty to avoid touching the real
 * localStorage-backed store across tests.
 */

vi.mock("../api/mempool", () => ({
  fetchPending: vi.fn(),
}));

vi.mock("../hooks/useTrackedTxs", () => ({
  useTrackedTxs: () => [],
}));

import MempoolView from "../components/mempool/MempoolView";
import { fetchPending } from "../api/mempool";

const mockFetch = fetchPending as unknown as ReturnType<typeof vi.fn>;

function tx(overrides: Partial<PendingTx> = {}): PendingTx {
  return {
    hash: "0x" + "a".repeat(64),
    from: "0x" + "b".repeat(40),
    nonce: 0,
    type: "eip1559",
    gasPrice: null,
    maxFeePerGas: "1000000000",
    maxPriorityFeePerGas: "500000000",
    ...overrides,
  };
}

function snapshot(transactions: PendingTx[]): MempoolPending {
  return {
    transactions,
    pendingCount: transactions.length,
    queuedCount: 0,
    truncated: false,
  };
}

describe("<MempoolView />", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the loading copy while the query is pending", () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves
    renderWithProviders(<MempoolView />);
    expect(
      screen.getByText(/Loading pending transactions/i),
    ).toBeInTheDocument();
  });

  it("renders the API's error message on failure", async () => {
    mockFetch.mockRejectedValue(new Error("upstream RPC timeout"));
    renderWithProviders(<MempoolView />);
    expect(
      await screen.findByText(/upstream RPC timeout/i),
    ).toBeInTheDocument();
  });

  it("shows the empty state when the mempool returns zero pending", async () => {
    mockFetch.mockResolvedValue(snapshot([]));
    renderWithProviders(<MempoolView />);
    expect(
      await screen.findByText(/No pending transactions/i),
    ).toBeInTheDocument();
  });

  it("renders one row per tx with the formatted gas readout from gweiDisp", async () => {
    mockFetch.mockResolvedValue(
      snapshot([
        tx({
          hash: "0x" + "1".repeat(64),
          from: "0x" + "2".repeat(40),
          // 1.5 gwei tip / 2 gwei cap
          maxPriorityFeePerGas: "1500000000",
          maxFeePerGas: "2000000000",
        }),
      ]),
    );
    renderWithProviders(<MempoolView />);

    // gweiDisp produces "1.5" for tip and "2" for cap, glued together
    // in the same gas-cell <span>. Match the whole readout shape so
    // we're verifying the cell's full output, not just one bare digit
    // that might appear elsewhere in the table chrome.
    await waitFor(() => {
      const rows = screen.getAllByText((_content, node) => {
        const text = node?.textContent ?? "";
        return /tip 1\.5\s*\/\s*cap 2\s*gwei/.test(text);
      });
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  it("filters rows when a search query is typed (filterAndSortPending wired up)", async () => {
    // Two distinct types so the toolbar's "showing X of Y" copy renders
    // (it's gated on presentTypes.length > 1).
    const a = tx({
      hash: "0xaaa" + "0".repeat(61),
      from: "0xaaa" + "0".repeat(37),
      type: "eip1559",
    });
    const b = tx({
      hash: "0xbbb" + "0".repeat(61),
      from: "0xbbb" + "0".repeat(37),
      type: "legacy",
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
      gasPrice: "1000000000",
    });
    mockFetch.mockResolvedValue(snapshot([a, b]));
    renderWithProviders(<MempoolView />);

    const input = await screen.findByPlaceholderText(/from address or tx hash/i);
    // Both rows visible before filtering
    await screen.findByText(/showing 2 of 2/i);

    fireEvent.change(input, { target: { value: "0xbbb" } });

    // After filtering, the toolbar's "showing X of Y" reflects 1 of 2
    await waitFor(() => {
      expect(screen.getByText(/showing 1 of 2/i)).toBeInTheDocument();
    });
  });
});
