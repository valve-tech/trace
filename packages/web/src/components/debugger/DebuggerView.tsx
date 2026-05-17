import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  CallTree,
  GasFlamegraph,
  OpcodeViewer,
  normalizeCallFrame,
  normalizeStructLogs,
} from "@valve-tech/trace-sdk";
import {
  fetchTrace,
  fetchGasProfile,
  fetchOpcodes,
  type CallFrame,
  type GasProfile,
  type OpcodeProfile,
  type OpcodeStep,
} from "../../api/debugger";
import { lookupWellKnown } from "../../lib/wellKnownSignatures";
import GasProfiler from "./GasProfiler";
import StepDebugger from "./StepDebugger";

type DebugTab = "debugger" | "calltree" | "gas" | "opcodes";

export default function DebuggerView() {
  const { txHash: urlHash } = useParams<{ txHash?: string }>();
  const navigate = useNavigate();
  const [txHash, setTxHash] = useState(urlHash ?? "");
  const [activeTab, setActiveTab] = useState<DebugTab>("debugger");
  const initialLoadDone = useRef(false);

  // Data
  const [callTrace, setCallTrace] = useState<CallFrame | null>(null);
  const [gasProfile, setGasProfile] = useState<GasProfile | null>(null);
  const [opcodeProfile, setOpcodeProfile] = useState<OpcodeProfile | null>(null);
  const [opcodeSteps, setOpcodeSteps] = useState<OpcodeStep[]>([]);
  const [targetAddress, setTargetAddress] = useState<string | null>(null);

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugAvailable, setDebugAvailable] = useState<boolean | null>(null);
  const [hasResult, setHasResult] = useState(false);

  const isValidHash = /^0x[0-9a-fA-F]{64}$/.test(txHash);

  // Normalize the wire-format trace into the SDK's canonical TraceFrame so
  // the SDK CallTree component can render it. Memoized so we don't re-walk
  // the tree on every render.
  const normalizedTrace = useMemo(
    () => (callTrace ? normalizeCallFrame(callTrace) : null),
    [callTrace],
  );

  // Same shape conversion for opcode steps — raw strings to branded Hex.
  const normalizedSteps = useMemo(
    () => normalizeStructLogs(opcodeSteps),
    [opcodeSteps],
  );

  const handleTrace = useCallback(async () => {
    if (!isValidHash) return;

    setLoading(true);
    setError(null);
    setCallTrace(null);
    setGasProfile(null);
    setOpcodeProfile(null);
    setOpcodeSteps([]);
    setDebugAvailable(null);
    setHasResult(false);
    setTargetAddress(null);

    try {
      // Fetch all traces in parallel — no explorer dependency
      const [traceRes, gasRes, opcodeRes] = await Promise.all([
        fetchTrace(txHash),
        fetchGasProfile(txHash),
        fetchOpcodes(txHash, 50000),
      ]);

      // Extract target address from the call trace
      if (traceRes.ok && traceRes.trace) {
        setCallTrace(traceRes.trace);
        setDebugAvailable(true);
        setTargetAddress(traceRes.trace.to || null);
      } else {
        setDebugAvailable(traceRes.debugAvailable ?? false);
        if (traceRes.error) {
          setError(traceRes.error);
        }
      }

      // Process gas profile result
      if (gasRes.ok && gasRes.gasProfile) {
        setGasProfile(gasRes.gasProfile);
        if (gasRes.opcodeProfile) {
          setOpcodeProfile(gasRes.opcodeProfile);
        }
      }

      // Process opcode result
      if (opcodeRes.ok && opcodeRes.steps) {
        setOpcodeSteps(opcodeRes.steps);
      }

      // If we got any data at all, mark as having results
      if (
        (traceRes.ok && traceRes.trace) ||
        (gasRes.ok && gasRes.gasProfile) ||
        (opcodeRes.ok && opcodeRes.steps && opcodeRes.steps.length > 0)
      ) {
        setHasResult(true);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setLoading(false);
    }
  }, [txHash, isValidHash]);

  // Auto-trace when URL contains a tx hash
  useEffect(() => {
    if (urlHash && /^0x[0-9a-fA-F]{64}$/.test(urlHash) && !initialLoadDone.current) {
      initialLoadDone.current = true;
      void handleTrace();
    }
  }, [urlHash, handleTrace]);

  const handleSubmitTrace = useCallback(() => {
    if (!isValidHash || loading) return;
    // Update URL to shareable link
    navigate(`/debugger/${txHash}`, { replace: true });
    void handleTrace();
  }, [isValidHash, loading, txHash, navigate, handleTrace]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmitTrace();
    }
  };

  return (
    <div className="space-y-6">
      {/* Search bar */}
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
          Smart Contract Debugger
        </h2>
        <p
          className="text-sm mb-4"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Paste a transaction hash to inspect its execution trace, call tree, and gas usage.
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            placeholder="0x... transaction hash"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value.trim())}
            onKeyDown={handleKeyDown}
            className="flex-1 px-4 py-2.5 rounded-lg border text-sm"
            style={{
              backgroundColor: "var(--color-bg-input)",
              borderColor: "var(--color-border-default)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          />
          <button
            onClick={handleSubmitTrace}
            disabled={!isValidHash || loading}
            className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor:
                isValidHash && !loading
                  ? "var(--color-accent)"
                  : "var(--color-border-default)",
              color:
                isValidHash && !loading
                  ? "#ffffff"
                  : "var(--color-text-muted)",
              cursor: isValidHash && !loading ? "pointer" : "not-allowed",
            }}
          >
            {loading ? "Tracing..." : "Debug"}
          </button>
        </div>

        {txHash && !isValidHash && txHash.length > 2 && (
          <p className="text-xs mt-2" style={{ color: "var(--color-danger)" }}>
            Invalid transaction hash. Must be a 0x-prefixed 64-character hex string.
          </p>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div
          className="rounded-lg border p-12 flex flex-col items-center justify-center"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <div className="spinner mb-4" />
          <p
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Tracing transaction execution...
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            This may take a moment for complex transactions.
          </p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && !hasResult && (
        <div
          className="rounded-lg border p-6"
          style={{
            backgroundColor: "var(--color-danger-muted)",
            borderColor: "var(--color-danger)",
          }}
        >
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              style={{ color: "var(--color-danger)" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <div>
              <h3
                className="text-sm font-semibold mb-1"
                style={{ color: "var(--color-danger)" }}
              >
                {debugAvailable === false
                  ? "Debug API Not Available"
                  : "Trace Error"}
              </h3>
              <p
                className="text-sm"
                style={{ color: "var(--color-text-primary)" }}
              >
                {error}
              </p>
              {debugAvailable === false && (
                <div
                  className="mt-3 p-3 rounded text-xs space-y-1"
                  style={{
                    backgroundColor: "var(--color-bg-primary)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    How to enable debug tracing:
                  </p>
                  <p>
                    1. Run a PulseChain node (Geth/Erigon) with <code style={{ fontFamily: "var(--font-mono)" }}>--http.api=eth,debug,net</code>
                  </p>
                  <p>
                    2. Set the <code style={{ fontFamily: "var(--font-mono)" }}>DEBUG_RPC_URL</code> environment variable to your node's URL
                  </p>
                  <p>
                    3. Restart the API server
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && hasResult && (
        <div>
          {/* Tabs */}
          <div
            className="border-b flex"
            style={{ borderColor: "var(--color-border-default)" }}
          >
            {(
              [
                {
                  key: "debugger",
                  label: "Step Debugger",
                  count: opcodeSteps.length,
                },
                { key: "calltree", label: "Call Tree", count: callTrace ? 1 : 0 },
                { key: "gas", label: "Gas Profile", count: gasProfile ? 1 : 0 },
                {
                  key: "opcodes",
                  label: "Opcodes",
                  count: opcodeSteps.length,
                },
              ] as const
            ).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
                style={{
                  borderColor:
                    activeTab === key
                      ? "var(--color-accent)"
                      : "transparent",
                  color:
                    activeTab === key
                      ? "var(--color-text-primary)"
                      : "var(--color-text-secondary)",
                  backgroundColor: "transparent",
                }}
              >
                {label}
                {count > 0 && (key === "opcodes" || key === "debugger") && (
                  <span
                    className="ml-2 text-xs px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: "var(--color-accent-muted)",
                      color: "var(--color-accent)",
                    }}
                  >
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="mt-4">
            {activeTab === "debugger" && (
              opcodeSteps.length > 0 ? (
                <StepDebugger
                  steps={opcodeSteps}
                  contractAddress={targetAddress ?? undefined}
                  callTrace={callTrace}
                />
              ) : (
                <NoDataPanel message="Step debugger requires opcode trace data. A debug-enabled node is needed." />
              )
            )}

            {activeTab === "calltree" && (
              normalizedTrace ? (
                <CallTree frame={normalizedTrace} />
              ) : (
                <NoDataPanel message="Call tree data is not available for this transaction." />
              )
            )}

            {activeTab === "gas" && (
              <div className="space-y-4">
                {normalizedTrace && (
                  <GasFlamegraph
                    frame={normalizedTrace}
                    resolveSelector={(sel) =>
                      lookupWellKnown(sel)?.signature?.split("(")[0]
                    }
                  />
                )}
                {gasProfile ? (
                  <GasProfiler
                    gasProfile={gasProfile}
                    opcodeProfile={opcodeProfile}
                  />
                ) : (
                  <NoDataPanel message="Gas profile data is not available for this transaction." />
                )}
              </div>
            )}

            {activeTab === "opcodes" && (
              normalizedSteps.length > 0 ? (
                <OpcodeViewer steps={normalizedSteps} />
              ) : (
                <NoDataPanel message="Opcode trace data is not available for this transaction." />
              )
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !hasResult && (
        <div
          className="rounded-lg border p-12 flex flex-col items-center justify-center text-center"
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
              d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152-6.135c-.117-1.687-.933-3.198-2.121-4.172A8.054 8.054 0 0012 2.25a8.054 8.054 0 00-4.934 1.683c-1.188.974-2.004 2.485-2.121 4.172a23.91 23.91 0 01-1.152 6.135A24.089 24.089 0 0112 12.75z"
            />
          </svg>
          <p
            className="text-sm mb-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Enter a transaction hash to debug
          </p>
          <p
            className="text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            Inspect call trees, gas usage, and opcode execution
          </p>
        </div>
      )}
    </div>
  );
}

function NoDataPanel({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg border p-8 text-center"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {message}
      </p>
    </div>
  );
}
