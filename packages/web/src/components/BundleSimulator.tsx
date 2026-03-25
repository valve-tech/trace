import { useState } from "react";
import { isAddress } from "viem";
import { simulateBundle } from "../api/simulate";
import type {
  BundleTxEntry,
  SimulationResult,
} from "../types";

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function createEmptyTx(): BundleTxEntry {
  return {
    id: generateId(),
    from: "",
    to: "",
    value: "",
    data: "",
    gasLimit: "8000000",
  };
}

function StatusBadge({ success }: { success: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{
        backgroundColor: success
          ? "var(--color-success-muted)"
          : "var(--color-danger-muted)",
        color: success ? "var(--color-success)" : "var(--color-danger)",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          backgroundColor: success ? "var(--color-success)" : "var(--color-danger)",
        }}
      />
      {success ? "Success" : "Reverted"}
    </span>
  );
}

function TxCard({
  tx,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  tx: BundleTxEntry;
  index: number;
  onChange: (id: string, field: keyof BundleTxEntry, value: string) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}) {
  const fromValid = !tx.from || isAddress(tx.from);
  const toValid = !tx.to || isAddress(tx.to);

  const inputStyle = {
    fontFamily: "var(--font-mono)",
    backgroundColor: "var(--color-bg-input)",
    borderColor: "var(--color-border-default)",
    color: "var(--color-text-primary)",
  };

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          <span
            className="inline-flex items-center justify-center w-6 h-6 rounded-full mr-2 text-xs font-bold"
            style={{
              backgroundColor: "var(--color-accent-muted)",
              color: "var(--color-accent)",
            }}
          >
            {index + 1}
          </span>
          Transaction #{index + 1}
        </h3>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(tx.id)}
            className="text-xs px-2 py-1 rounded hover:opacity-80"
            style={{
              color: "var(--color-danger)",
              backgroundColor: "var(--color-danger-muted)",
            }}
          >
            Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="flex items-center gap-2 text-xs font-medium mb-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            From
            <span
              className="px-1 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider"
              style={{
                backgroundColor: "var(--color-warning-muted)",
                color: "var(--color-warning)",
              }}
            >
              Impersonate
            </span>
          </label>
          <input
            type="text"
            value={tx.from}
            onChange={(e) => onChange(tx.id, "from", e.target.value)}
            placeholder="0x..."
            className="w-full px-2 py-1.5 rounded border text-sm"
            style={{
              ...inputStyle,
              borderColor: !fromValid ? "var(--color-danger)" : inputStyle.borderColor,
            }}
          />
        </div>
        <div>
          <label
            className="text-xs font-medium mb-1 block"
            style={{ color: "var(--color-text-secondary)" }}
          >
            To
          </label>
          <input
            type="text"
            value={tx.to}
            onChange={(e) => onChange(tx.id, "to", e.target.value)}
            placeholder="0x..."
            className="w-full px-2 py-1.5 rounded border text-sm"
            style={{
              ...inputStyle,
              borderColor: !toValid ? "var(--color-danger)" : inputStyle.borderColor,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label
            className="text-xs font-medium mb-1 block"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Value (PLS)
          </label>
          <input
            type="text"
            value={tx.value}
            onChange={(e) => onChange(tx.id, "value", e.target.value)}
            placeholder="0.0"
            className="w-full px-2 py-1.5 rounded border text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <label
            className="text-xs font-medium mb-1 block"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Gas Limit
          </label>
          <input
            type="text"
            value={tx.gasLimit}
            onChange={(e) => onChange(tx.id, "gasLimit", e.target.value)}
            placeholder="8000000"
            className="w-full px-2 py-1.5 rounded border text-sm"
            style={inputStyle}
          />
        </div>
        <div className="col-span-1" />
      </div>

      <div>
        <label
          className="text-xs font-medium mb-1 block"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Calldata (hex)
        </label>
        <textarea
          value={tx.data}
          onChange={(e) => onChange(tx.id, "data", e.target.value)}
          placeholder="0x..."
          rows={2}
          className="w-full px-2 py-1.5 rounded border text-sm resize-y"
          style={inputStyle}
        />
      </div>
    </div>
  );
}

function BundleResultCard({
  result,
  index,
}: {
  result: SimulationResult;
  index: number;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full mr-2 text-[10px] font-bold"
            style={{
              backgroundColor: result.success
                ? "var(--color-success-muted)"
                : "var(--color-danger-muted)",
              color: result.success ? "var(--color-success)" : "var(--color-danger)",
            }}
          >
            {index + 1}
          </span>
          Transaction #{index + 1}
        </h4>
        <StatusBadge success={result.success} />
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span style={{ color: "var(--color-text-secondary)" }}>Gas Used</span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-primary)",
            }}
          >
            {BigInt(result.gasUsed).toLocaleString()}
          </span>
        </div>

        {result.returnData && result.returnData !== "0x" && (
          <div>
            <span
              className="text-xs block mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Return Data
            </span>
            <span
              className="text-xs break-all block"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-primary)",
              }}
            >
              {result.returnData}
            </span>
          </div>
        )}

        {result.revertReason && (
          <div
            className="p-2 rounded-md mt-2"
            style={{ backgroundColor: "var(--color-danger-muted)" }}
          >
            <span
              className="text-xs font-medium block mb-0.5"
              style={{ color: "var(--color-danger)" }}
            >
              Revert Reason
            </span>
            <span
              className="text-xs break-all"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-primary)",
              }}
            >
              {result.revertReason}
            </span>
          </div>
        )}

        {result.decodedCall && (
          <div className="mt-2">
            <span
              className="text-xs block mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Function Call
            </span>
            <span
              className="text-xs px-2 py-1 rounded inline-block"
              style={{
                fontFamily: "var(--font-mono)",
                backgroundColor: "var(--color-accent-muted)",
                color: "var(--color-accent)",
              }}
            >
              {result.decodedCall.functionName}(
              {result.decodedCall.params.map((p) => p.type).join(", ")})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BundleSimulator() {
  const [transactions, setTransactions] = useState<BundleTxEntry[]>([createEmptyTx()]);
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTransaction = () => {
    setTransactions([...transactions, createEmptyTx()]);
  };

  const removeTransaction = (id: string) => {
    setTransactions(transactions.filter((t) => t.id !== id));
  };

  const updateTransaction = (id: string, field: keyof BundleTxEntry, value: string) => {
    setTransactions(
      transactions.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
    );
  };

  const canSubmit = transactions.every(
    (t) =>
      t.from &&
      t.to &&
      isAddress(t.from) &&
      isAddress(t.to),
  );

  const handleSimulate = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const txRequests = transactions.map((t) => {
        let weiValue: string | undefined;
        if (t.value) {
          const plsFloat = parseFloat(t.value);
          if (!isNaN(plsFloat)) {
            const weiBigInt = BigInt(Math.floor(plsFloat * 1e18));
            weiValue = "0x" + weiBigInt.toString(16);
          }
        }
        return {
          from: t.from,
          to: t.to,
          value: weiValue,
          data: t.data || undefined,
          gasLimit: t.gasLimit ? parseInt(t.gasLimit, 10) : undefined,
        };
      });

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
      {/* Left: Transaction list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Transaction Bundle
            <span
              className="ml-2 text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--color-accent-muted)",
                color: "var(--color-accent)",
              }}
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
          className="w-full py-2.5 rounded-lg border border-dashed text-sm transition-colors hover:opacity-80"
          style={{
            borderColor: "var(--color-border-default)",
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
            color: canSubmit && !loading ? "white" : "var(--color-text-muted)",
            cursor: canSubmit && !loading ? "pointer" : "not-allowed",
            opacity: canSubmit && !loading ? 1 : 0.6,
          }}
        >
          {loading ? "Simulating Bundle..." : "Simulate Bundle"}
        </button>
      </div>

      {/* Right: Results */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Bundle Results
        </h2>

        {loading && (
          <div
            className="rounded-lg border p-8 flex flex-col items-center justify-center text-center"
            style={{
              backgroundColor: "var(--color-bg-card)",
              borderColor: "var(--color-border-default)",
            }}
          >
            <div className="spinner mb-4" />
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Simulating {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}...
            </p>
          </div>
        )}

        {error && (
          <div
            className="rounded-lg border p-4"
            style={{
              backgroundColor: "var(--color-bg-card)",
              borderColor: "var(--color-danger)",
            }}
          >
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                style={{ color: "var(--color-danger)" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-danger)" }}>
                  Bundle Simulation Error
                </h3>
                <p
                  className="text-sm break-all"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {error}
                </p>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && results.length === 0 && (
          <div
            className="rounded-lg border p-8 flex flex-col items-center justify-center text-center min-h-[300px]"
            style={{
              backgroundColor: "var(--color-bg-card)",
              borderColor: "var(--color-border-default)",
            }}
          >
            <svg
              className="w-12 h-12 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
              style={{ color: "var(--color-border-default)" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <h3
              className="text-sm font-medium mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              No Bundle Results
            </h3>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Add transactions and simulate to see sequential results.
            </p>
          </div>
        )}

        {results.length > 0 && (
          <>
            {/* Summary bar */}
            <div
              className="rounded-lg border p-3 flex items-center justify-between"
              style={{
                backgroundColor: "var(--color-bg-card)",
                borderColor: "var(--color-border-default)",
              }}
            >
              <div className="flex items-center gap-4 text-xs">
                <span style={{ color: "var(--color-text-secondary)" }}>
                  Total:{" "}
                  <strong style={{ color: "var(--color-text-primary)" }}>
                    {results.length} txs
                  </strong>
                </span>
                <span style={{ color: "var(--color-success)" }}>
                  {results.filter((r) => r.success).length} succeeded
                </span>
                {results.some((r) => !r.success) && (
                  <span style={{ color: "var(--color-danger)" }}>
                    {results.filter((r) => !r.success).length} reverted
                  </span>
                )}
              </div>
              <span
                className="text-xs"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-muted)",
                }}
              >
                {results
                  .reduce((sum, r) => sum + BigInt(r.gasUsed), 0n)
                  .toLocaleString()}{" "}
                total gas
              </span>
            </div>

            {results.map((r, i) => (
              <BundleResultCard key={i} result={r} index={i} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
