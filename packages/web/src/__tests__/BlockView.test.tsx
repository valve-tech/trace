import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlockDetails } from "../api/explorer";

/**
 * Component-level tests for BlockView. The big extracted dependency
 * here is BlockView/formatters.ts (formatTimestamp); these tests prove
 * the formatter actually runs against the rendered block timestamp.
 *
 * BlockView doesn't use TanStack Query — it has its own
 * useState/useEffect fetch loop. So we mock the api/explorer module
 * directly and drive resolved/rejected promises.
 */

vi.mock("../api/explorer", () => ({
  fetchBlock: vi.fn(),
}));

import BlockView from "../components/explorer/BlockView";
import { fetchBlock } from "../api/explorer";

const mockFetch = fetchBlock as unknown as ReturnType<typeof vi.fn>;

function block(overrides: Partial<BlockDetails> = {}): BlockDetails {
  return {
    number: "12345678",
    hash: "0x" + "ab".repeat(32),
    parentHash: "0x" + "cd".repeat(32),
    // 2026-05-30T22:00:00Z in unix seconds
    timestamp: Math.floor(Date.UTC(2026, 4, 30, 22, 0, 0) / 1000),
    miner: "0x" + "11".repeat(20),
    gasUsed: "5000000",
    gasLimit: "30000000",
    baseFeePerGas: "1000000000",
    transactionCount: 0,
    size: "1024",
    transactions: [],
    ...overrides,
  };
}

function renderView(props: { numberOrHash?: string } = {}) {
  const onNavigate = vi.fn();
  // BlockView now embeds AddToWorkspaceButton, which calls useWorkspaces ->
  // useQueryClient. Pass the provider via the `wrapper` option so it sticks
  // through any rerender() — testing-library's render(jsx, ...) replaces the
  // entire tree on rerender; only wrapper is preserved.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(
    <BlockView numberOrHash={props.numberOrHash ?? "12345678"} onNavigate={onNavigate} />,
    { wrapper: Wrapper },
  );
  return { onNavigate, ...result };
}

describe("<BlockView />", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading copy before fetchBlock resolves", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    renderView();
    expect(screen.getByText(/Loading block/i)).toBeInTheDocument();
  });

  it("renders the fetched error message on failure", async () => {
    mockFetch.mockRejectedValue(new Error("block not found"));
    renderView();
    expect(await screen.findByText(/block not found/i)).toBeInTheDocument();
  });

  it("renders the block number and hash on success", async () => {
    mockFetch.mockResolvedValue(block());
    renderView();
    // "Block #12,345,678" once Number().toLocaleString() runs
    expect(await screen.findByText(/12,345,678/)).toBeInTheDocument();
  });

  it("formats the timestamp through the extracted formatTimestamp helper", async () => {
    // A relatively recent timestamp (10 minutes before "now") so the
    // formatter produces a stable "10m ago" suffix regardless of the
    // wall clock during the test run. We can't inject `now` into the
    // component, so use a window — confirm an "Xm ago" tail appears
    // for a block timestamped 10 minutes back.
    const tenMinAgo = Math.floor((Date.now() - 10 * 60 * 1000) / 1000);
    mockFetch.mockResolvedValue(block({ timestamp: tenMinAgo }));
    renderView();

    // The formatTimestamp output ends with "(Xm ago)" for 10-min blocks.
    await waitFor(() => {
      expect(screen.getByText(/\(\d+m ago\)/)).toBeInTheDocument();
    });
  });

  it("re-fetches when the numberOrHash prop changes (effect dep)", async () => {
    mockFetch.mockResolvedValue(block());
    const { rerender, onNavigate } = renderView({ numberOrHash: "100" });
    await screen.findByText(/12,345,678/);

    // Second arg is the active chain id — 369 (default) since the test URL has no ?chainid.
    expect(mockFetch).toHaveBeenCalledWith("100", 369);
    rerender(<BlockView numberOrHash="200" onNavigate={onNavigate} />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("200", 369);
    });
  });
});
