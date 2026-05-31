import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./_test-utils";

/**
 * Component-level tests for TransactionBuilder. Asserts that the
 * extracted ABI helpers (TransactionBuilder/abi.ts) and the plsToWei
 * conversion drive the rendered function picker, argument inputs, and
 * the /api/simulate/fork POST body.
 *
 * useContractSource is mocked (it has its own dedicated tests in
 * useContractSource.test.tsx); the simulate POST is intercepted via a
 * global fetch stub.
 */

const sourceMock = vi.fn();

vi.mock("../hooks/useContractSource", () => ({
  useContractSource: (...args: unknown[]) => sourceMock(...args),
}));

import TransactionBuilder from "../components/TransactionBuilder";

const CONTRACT = "0x1234567890123456789012345678901234567890";

const SAMPLE_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

describe("<TransactionBuilder />", () => {
  beforeEach(() => {
    sourceMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the 'Contract not verified' warning when there's no source data", async () => {
    sourceMock.mockReturnValue({ data: null, isLoading: false });
    renderWithProviders(<TransactionBuilder />);

    const addressInput = screen.getByPlaceholderText("0x...");
    fireEvent.change(addressInput, { target: { value: CONTRACT } });

    await waitFor(() => {
      expect(
        screen.getByText(/Contract not verified/i),
      ).toBeInTheDocument();
    });
  });

  it("renders write/read tabs with counts derived from getWriteFunctions/getReadFunctions", async () => {
    sourceMock.mockReturnValue({
      data: { abi: SAMPLE_ABI, contractName: "Token" },
      isLoading: false,
    });
    renderWithProviders(<TransactionBuilder />);

    const addressInput = screen.getByPlaceholderText("0x...");
    fireEvent.change(addressInput, { target: { value: CONTRACT } });

    // Header copy summarizes counts: "Token — 2 write, 1 read functions"
    await waitFor(() => {
      expect(
        screen.getByText(/Token.*2 write.*1 read/i),
      ).toBeInTheDocument();
    });
    // Tab labels show the same counts
    expect(screen.getByRole("button", { name: /Write \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Read \(1\)/ })).toBeInTheDocument();
  });

  it("selecting a function pre-fills inputs with getDefaultValue per input type", async () => {
    sourceMock.mockReturnValue({
      data: { abi: SAMPLE_ABI, contractName: "Token" },
      isLoading: false,
    });
    renderWithProviders(<TransactionBuilder />);
    fireEvent.change(screen.getByPlaceholderText("0x..."), {
      target: { value: CONTRACT },
    });

    // Pick `transfer(address to, uint256 amount)`
    fireEvent.click(await screen.findByText("transfer"));

    // After selection, the form should show inputs for `to` (address →
    // default "") and `amount` (uint256 → default "0"). Find the
    // <input> nodes by their placeholders, which reflect the type when
    // the default is empty, or the default when it's non-empty.
    await waitFor(() => {
      // amount input pre-fills "0"
      const amountInput = screen
        .getAllByRole("textbox")
        .find((el) => (el as HTMLInputElement).value === "0");
      expect(amountInput).toBeDefined();
    });
  });

  it("payable functions reveal the value input (PLS amount field)", async () => {
    sourceMock.mockReturnValue({
      data: { abi: SAMPLE_ABI, contractName: "Token" },
      isLoading: false,
    });
    renderWithProviders(<TransactionBuilder />);
    fireEvent.change(screen.getByPlaceholderText("0x..."), {
      target: { value: CONTRACT },
    });

    fireEvent.click(await screen.findByText("deposit"));

    expect(await screen.findByText(/Value \(PLS\)/i)).toBeInTheDocument();
  });

  it("clicking 'Fork Simulate' POSTs to /api/simulate/fork with calldata + plsToWei value", async () => {
    sourceMock.mockReturnValue({
      data: { abi: SAMPLE_ABI, contractName: "Token" },
      isLoading: false,
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              result: {
                success: true,
                gasUsed: "21000",
                stateDiff: { balanceChanges: [], storageChanges: [] },
                revertReason: null,
              },
            }),
          }) as Response,
      );

    renderWithProviders(<TransactionBuilder />);
    fireEvent.change(screen.getByPlaceholderText("0x..."), {
      target: { value: CONTRACT },
    });

    fireEvent.click(await screen.findByText("deposit"));

    // Set value = 1 PLS → plsToWei("1") = "0xde0b6b3a7640000"
    const valueInput = await screen.findByPlaceholderText("0");
    fireEvent.change(valueInput, { target: { value: "1" } });

    fireEvent.click(screen.getByRole("button", { name: /Fork Simulate/i }));

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        ([url]) => String(url) === "/api/simulate/fork",
      );
      expect(call).toBeDefined();
      const body = JSON.parse(
        (call![1] as RequestInit).body as string,
      ) as Record<string, string>;
      expect(body.to).toBe(CONTRACT);
      expect(body.data).toMatch(/^0x[0-9a-f]+$/);
      // plsToWei("1") → "0xde0b6b3a7640000" (1e18 wei)
      expect(body.value).toBe("0xde0b6b3a7640000");
    });
  });
});
