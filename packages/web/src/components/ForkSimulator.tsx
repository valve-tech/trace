import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { isAddress } from "viem";
import type { ForkSimulationResult, ForkSimulationResponse } from "../api/simulate";

// ---------------------------------------------------------------------------
// Types for the fork simulate API (inline to avoid circular deps)
// ---------------------------------------------------------------------------

async function forkSimulateApi(params: {
  from: string;
  to: string;
  value?: string;
  data?: string;
  blockNumber?: number;
}): Promise<ForkSimulationResponse> {
  const res = await fetch("/api/simulate/fork", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return (await res.json()) as ForkSimulationResponse;
}

async function simulateFromHashApi(txHash: string): Promise<ForkSimulationResponse> {
  const res = await fetch("/api/simulate/from-hash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txHash }),
  });
  return (await res.json()) as ForkSimulationResponse;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type InputMode = "hash" | "manual";

export default function ForkSimulator() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<InputMode>("hash");

  // Hash mode
  const [txHash, setTxHash] = useState("");

  // Manual mode
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [value, setValue] = useState("");
  const [data, setData] = useState("");
  const [blockNumber, setBlockNumber] = useState("");

  // Result state
  const [result, setResult] = useState<ForkSimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidHash = /^0x[0-9a-fA-F]{64}$/.test(txHash);

  const handleSimulate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let response: ForkSimulationResponse;

      if (mode === "hash") {
        response = await simulateFromHashApi(txHash);
      } else {
        response = await forkSimulateApi({
          from,
          to,
          value: value ? "0x" + BigInt(Math.floor(parseFloat(value) * 1e18)).toString(16) : undefined,
          data: data || undefined,
          blockNumber: blockNumber ? parseInt(blockNumber, 10) : undefined,
        });
      }

      if (!response.ok) {
        setError(response.error ?? "Simulation failed");
        return;
      }

      setResult(response.result ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [mode, txHash, from, to, value, data, blockNumber]);

  const canSubmit =
    mode === "hash"
      ? isValidHash && !loading
      : isAddress(from) && isAddress(to) && !loading;

  return (
    <div className="space-y-6">
      {/* Input Card */}
      <div
        className="rounded-lg border p-6"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
        }}
      >
        <h2
          className="text-lg font-semibold mb-1"
          style={{ color: "var(--color-text-primary)" }}
        >
          Fork Simulation
        </h2>
        <p
          className="text-sm mb-4"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Re-execute a transaction on a forked chain to see exact state changes.
        </p>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <ModeButton active={mode === "hash"} onClick={() => setMode("hash")} label="Tx Hash" />
          <ModeButton active={mode === "manual"} onClick={() => setMode("manual")} label="Manual Entry" />
        </div>

        {mode === "hash" ? (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="0x... transaction hash"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSimulate()}
              className="w-full px-4 py-2.5 rounded-lg border text-sm"
              style={{
                backgroundColor: "var(--color-bg-input)",
                borderColor: "var(--color-border-default)",
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-mono)",
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <FormField label="From" value={from} onChange={setFrom} placeholder="0x... sender address" mono />
              <FormField label="To" value={to} onChange={setTo} placeholder="0x... target address" mono />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <FormField label="Value (PLS)" value={value} onChange={setValue} placeholder="0" />
              <FormField label="Block Number" value={blockNumber} onChange={setBlockNumber} placeholder="latest" />
            </div>
            <FormField label="Calldata" value={data} onChange={setData} placeholder="0x..." mono multiline />
          </div>
        )}

        <button
          onClick={handleSimulate}
          disabled={!canSubmit}
          className="mt-4 w-full px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: canSubmit ? "var(--color-accent)" : "var(--color-border-default)",
            color: canSubmit ? "#ffffff" : "var(--color-text-muted)",
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "Forking & Simulating..." : "Fork Simulate"}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div
          className="rounded-lg border p-8 flex flex-col items-center"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <div className="spinner mb-3" />
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Spinning up Anvil fork and executing transaction...
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
            This captures full state diffs — may take a few seconds.
          </p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--color-danger-muted)",
            borderColor: "var(--color-danger)",
          }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--color-danger)" }}>
            Simulation Failed
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-primary)" }}>{error}</p>
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <div className="space-y-4">
          {/* Status + gas summary */}
          <div
            className="rounded-lg border p-4 flex items-center justify-between"
            style={{
              backgroundColor: "var(--color-bg-card)",
              borderColor: "var(--color-border-default)",
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="px-2 py-1 rounded text-xs font-semibold"
                style={{
                  backgroundColor: result.success
                    ? "rgba(16, 185, 129, 0.15)"
                    : "rgba(239, 68, 68, 0.15)",
                  color: result.success ? "var(--color-success)" : "var(--color-danger)",
                }}
              >
                {result.success ? "SUCCESS" : "REVERTED"}
              </span>
              <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                Gas: <span style={{ fontFamily: "var(--font-mono)" }}>{Number(result.gasUsed).toLocaleString()}</span>
              </span>
              {result.blockNumber > 0 && (
                <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  Block: {result.blockNumber.toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {result.contractAddress && (
                <button
                  onClick={() => navigate(`/explorer?address=${result.contractAddress}`)}
                  className="text-xs px-3 py-1 rounded"
                  style={{
                    backgroundColor: "var(--color-accent-muted)",
                    color: "var(--color-accent)",
                  }}
                >
                  View Contract
                </button>
              )}
              {result.txHash && (
                <button
                  onClick={() => navigate(`/debugger/${result.txHash}`)}
                  className="text-xs px-3 py-1 rounded font-medium"
                  style={{
                    backgroundColor: "var(--color-accent)",
                    color: "#fff",
                  }}
                >
                  Debug This Tx
                </button>
              )}
            </div>
          </div>

          {/* Revert reason */}
          {result.revertReason && (
            <div
              className="rounded-lg border p-3"
              style={{
                backgroundColor: "var(--color-danger-muted)",
                borderColor: "var(--color-danger)",
              }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--color-danger)" }}>
                Revert Reason
              </p>
              <pre
                className="text-xs whitespace-pre-wrap"
                style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}
              >
                {result.revertReason}
              </pre>
            </div>
          )}

          {/* Balance Changes */}
          {result.stateDiff.balanceChanges.length > 0 && (
            <DiffSection title="Balance Changes" count={result.stateDiff.balanceChanges.length}>
              <table className="w-full text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                <thead>
                  <tr style={{ color: "var(--color-text-muted)" }}>
                    <th className="text-left py-1 px-2">Address</th>
                    <th className="text-right py-1 px-2">Before (PLS)</th>
                    <th className="text-right py-1 px-2">After (PLS)</th>
                    <th className="text-right py-1 px-2">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {result.stateDiff.balanceChanges.map((bc, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--color-border-default)" }}>
                      <td className="py-1.5 px-2" title={bc.address} style={{ color: "var(--color-text-primary)" }}>
                        {bc.address.slice(0, 8)}...{bc.address.slice(-6)}
                      </td>
                      <td className="text-right py-1.5 px-2" style={{ color: "var(--color-text-muted)" }}>
                        {parseFloat(bc.before).toFixed(4)}
                      </td>
                      <td className="text-right py-1.5 px-2" style={{ color: "var(--color-text-primary)" }}>
                        {parseFloat(bc.after).toFixed(4)}
                      </td>
                      <td
                        className="text-right py-1.5 px-2 font-semibold"
                        style={{
                          color: bc.delta.startsWith("+") || !bc.delta.startsWith("-")
                            ? "var(--color-success)"
                            : "var(--color-danger)",
                        }}
                      >
                        {bc.delta.startsWith("-") || bc.delta.startsWith("+") ? bc.delta : `+${bc.delta}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DiffSection>
          )}

          {/* Storage Changes */}
          {result.stateDiff.storageChanges.length > 0 && (
            <DiffSection title="Storage Changes" count={result.stateDiff.storageChanges.length}>
              <table className="w-full text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                <thead>
                  <tr style={{ color: "var(--color-text-muted)" }}>
                    <th className="text-left py-1 px-2">Contract</th>
                    <th className="text-left py-1 px-2">Slot</th>
                    <th className="text-left py-1 px-2">Before</th>
                    <th className="text-left py-1 px-2">After</th>
                  </tr>
                </thead>
                <tbody>
                  {result.stateDiff.storageChanges.map((sc, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--color-border-default)" }}>
                      <td className="py-1.5 px-2" title={sc.address} style={{ color: "var(--color-text-primary)" }}>
                        {sc.contractName ?? `${sc.address.slice(0, 8)}...${sc.address.slice(-4)}`}
                      </td>
                      <td className="py-1.5 px-2" title={sc.slot} style={{ color: "var(--color-text-muted)" }}>
                        {sc.decodedName ?? `${sc.slot.slice(0, 10)}...`}
                      </td>
                      <td className="py-1.5 px-2" title={sc.before} style={{ color: "var(--color-danger)" }}>
                        {sc.before.slice(0, 14)}...
                      </td>
                      <td className="py-1.5 px-2" title={sc.after} style={{ color: "var(--color-success)" }}>
                        {sc.after.slice(0, 14)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DiffSection>
          )}

          {/* Events */}
          {result.logs.length > 0 && (
            <DiffSection title="Events Emitted" count={result.logs.length}>
              <div className="space-y-2 p-2">
                {result.logs.map((log, i) => (
                  <div key={i} className="text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                    <span style={{ color: "var(--color-accent)" }}>{log.address.slice(0, 10)}...</span>
                    {log.topics[0] && (
                      <span style={{ color: "var(--color-text-muted)" }}>
                        {" "}topic0: {log.topics[0].slice(0, 14)}...
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </DiffSection>
          )}

          {/* No state changes */}
          {result.stateDiff.balanceChanges.length === 0 &&
            result.stateDiff.storageChanges.length === 0 &&
            result.logs.length === 0 && (
              <div
                className="rounded-lg border p-6 text-center"
                style={{
                  backgroundColor: "var(--color-bg-card)",
                  borderColor: "var(--color-border-default)",
                }}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  No state changes detected (view-only call or no storage writes)
                </p>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
      style={{
        backgroundColor: active ? "var(--color-accent)" : "var(--color-bg-secondary)",
        color: active ? "#fff" : "var(--color-text-secondary)",
        border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}`,
      }}
    >
      {label}
    </button>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  const style = {
    backgroundColor: "var(--color-bg-input)",
    borderColor: "var(--color-border-default)",
    color: "var(--color-text-primary)",
    fontFamily: mono ? "var(--font-mono)" : undefined,
  };

  return (
    <div>
      <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
          style={style}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={style}
        />
      )}
    </div>
  );
}

function DiffSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{
          borderColor: "var(--color-border-default)",
          backgroundColor: "var(--color-bg-secondary)",
        }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {title}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "var(--color-accent-muted)",
            color: "var(--color-accent)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}
