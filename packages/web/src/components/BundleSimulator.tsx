import { useState } from "react";
import { isAddress } from "viem";
import { simulateBundle } from "../api/simulate";
import type { BundleTxEntry, SimulationResult } from "../types";
import { createEmptyTx } from "./BundleSimulator/helpers";
import { TxCard } from "./BundleSimulator/TxCard";
import { BundleResultCard } from "./BundleSimulator/BundleResultCard";
import {
  LoadingPanel,
  ErrorPanel,
  EmptyPanel,
  SummaryBar,
} from "./BundleSimulator/ResultPanels";

function toWeiHex(plsValue: string): string | undefined {
  if (!plsValue) return undefined;
  const plsFloat = parseFloat(plsValue);
  if (isNaN(plsFloat)) return undefined;
  const weiBigInt = BigInt(Math.floor(plsFloat * 1e18));
  return "0x" + weiBigInt.toString(16);
}

export default function BundleSimulator() {
  const [transactions, setTransactions] = useState<BundleTxEntry[]>([
    createEmptyTx(),
  ]);
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTransaction = () =>
    setTransactions([...transactions, createEmptyTx()]);

  const removeTransaction = (id: string) =>
    setTransactions(transactions.filter((t) => t.id !== id));

  const updateTransaction = (
    id: string,
    field: keyof BundleTxEntry,
    value: string,
  ) =>
    setTransactions(
      transactions.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
    );

  const canSubmit = transactions.every(
    (t) => t.from && t.to && isAddress(t.from) && isAddress(t.to),
  );

  const handleSimulate = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const txRequests = transactions.map((t) => ({
        from: t.from,
        to: t.to,
        value: toWeiHex(t.value),
        data: t.data || undefined,
        gasLimit: t.gasLimit ? parseInt(t.gasLimit, 10) : undefined,
      }));

      const bundleResult = await simulateBundle({ transactions: txRequests });
      setResults(bundleResult.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-stack">
        <div className="flex items-center justify-between">
          <h2
            className="text-sm font-semibold theme-text"
          >
            Transaction Bundle
            <span
              className="ml-2 text-xs px-2 py-0.5 rounded-full theme-accent-bg theme-accent"
            >
              {transactions.length} tx{transactions.length !== 1 ? "s" : ""}
            </span>
          </h2>
        </div>

        {transactions.map((tx, i) => (
          <TxCard
            key={tx.id}
            tx={tx}
            index={i}
            onChange={updateTransaction}
            onRemove={removeTransaction}
            canRemove={transactions.length > 1}
          />
        ))}

        <button
          type="button"
          onClick={addTransaction}
          className="w-full py-2.5 rounded-lg bs border-dashed text-sm transition-colors hover:opacity-80"
          style={{
            color: "var(--color-text-secondary)",
            backgroundColor: "transparent",
          }}
        >
          + Add Transaction
        </button>

        <button
          type="button"
          onClick={handleSimulate}
          disabled={!canSubmit || loading}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{
            backgroundColor:
              canSubmit && !loading
                ? "var(--color-accent)"
                : "var(--color-border-default)",
            color:
              canSubmit && !loading ? "white" : "var(--color-text-muted)",
            cursor: canSubmit && !loading ? "pointer" : "not-allowed",
            opacity: canSubmit && !loading ? 1 : 0.6,
          }}
        >
          {loading ? "Simulating Bundle..." : "Simulate Bundle"}
        </button>
      </div>

      <div className="space-y-stack">
        <h2
          className="text-sm font-semibold theme-text"
        >
          Bundle Results
        </h2>

        {loading && <LoadingPanel count={transactions.length} />}
        {error && <ErrorPanel message={error} />}
        {!loading && !error && results.length === 0 && <EmptyPanel />}

        {results.length > 0 && (
          <>
            <SummaryBar results={results} />
            {results.map((r, i) => (
              <BundleResultCard key={i} result={r} index={i} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
