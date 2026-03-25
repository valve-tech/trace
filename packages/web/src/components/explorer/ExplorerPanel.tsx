import { useState, useCallback } from "react";
import TxSearch, { type SearchTarget } from "./TxSearch";
import TxDetail from "./TxDetail";
import AddressView from "./AddressView";
import BlockView from "./BlockView";
import ContractView from "./ContractView";

type ExplorerView =
  | { type: "none" }
  | { type: "tx"; hash: string }
  | { type: "address"; address: string }
  | { type: "block"; numberOrHash: string }
  | { type: "contract"; address: string };

export default function ExplorerPanel() {
  const [view, setView] = useState<ExplorerView>({ type: "none" });
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ExplorerView[]>([]);

  const navigateTo = useCallback(
    (newView: ExplorerView) => {
      if (view.type !== "none") {
        setHistory((prev) => [...prev, view]);
      }
      setView(newView);
    },
    [view],
  );

  const goBack = useCallback(() => {
    if (history.length === 0) {
      setView({ type: "none" });
      return;
    }
    const prev = history[history.length - 1]!;
    setHistory((h) => h.slice(0, -1));
    setView(prev);
  }, [history]);

  const handleSearch = (target: SearchTarget) => {
    setLoading(true);
    switch (target.type) {
      case "tx":
        navigateTo({ type: "tx", hash: target.value });
        break;
      case "address":
        navigateTo({ type: "address", address: target.value });
        break;
      case "block":
        navigateTo({ type: "block", numberOrHash: target.value });
        break;
    }
    // Loading is managed by child components
    setTimeout(() => setLoading(false), 100);
  };

  const handleNavigate = (target: {
    type: "tx" | "address" | "block" | "contract";
    value: string;
  }) => {
    switch (target.type) {
      case "tx":
        navigateTo({ type: "tx", hash: target.value });
        break;
      case "address":
        navigateTo({ type: "address", address: target.value });
        break;
      case "block":
        navigateTo({ type: "block", numberOrHash: target.value });
        break;
      case "contract":
        navigateTo({ type: "contract", address: target.value });
        break;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <TxSearch onSearch={handleSearch} loading={loading} />

      {/* Back button */}
      {view.type !== "none" && (
        <div className="flex items-center gap-3">
          {history.length > 0 && (
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded hover:opacity-80 transition-opacity cursor-pointer"
              style={{
                backgroundColor: "var(--color-bg-card)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{
                backgroundColor: "var(--color-accent-muted)",
                color: "var(--color-accent)",
              }}
            >
              {view.type}
            </span>
            <span
              className="text-xs font-mono truncate max-w-[400px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              {view.type === "tx"
                ? view.hash
                : view.type === "address"
                  ? view.address
                  : view.type === "block"
                    ? `#${view.numberOrHash}`
                    : view.type === "contract"
                      ? view.address
                      : ""}
            </span>
          </div>
        </div>
      )}

      {/* Detail view */}
      {view.type === "none" && (
        <div
          className="rounded-lg border p-8 flex flex-col items-center justify-center min-h-[400px] text-center"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <svg
            className="w-16 h-16 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
            style={{ color: "var(--color-border-default)" }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <h3
            className="text-sm font-medium mb-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Transaction Explorer
          </h3>
          <p
            className="text-xs max-w-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            Search by transaction hash, address, or block number to explore
            PulseChain data with full decoding.
          </p>
        </div>
      )}

      {view.type === "tx" && (
        <TxDetail hash={view.hash} onNavigate={handleNavigate} />
      )}

      {view.type === "address" && (
        <AddressView address={view.address} onNavigate={handleNavigate} />
      )}

      {view.type === "block" && (
        <BlockView
          numberOrHash={view.numberOrHash}
          onNavigate={handleNavigate}
        />
      )}

      {view.type === "contract" && (
        <ContractView address={view.address} onNavigate={handleNavigate} />
      )}
    </div>
  );
}
