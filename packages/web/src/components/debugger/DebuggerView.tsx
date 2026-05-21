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
import { isValidTxHash } from "./DebuggerView/validation";
import { SearchBar } from "./DebuggerView/SearchBar";
import { LoadingPanel } from "./DebuggerView/LoadingPanel";
import { ErrorPanel } from "./DebuggerView/ErrorPanel";
import { EmptyState } from "./DebuggerView/EmptyState";
import { NoDataPanel } from "./DebuggerView/NoDataPanel";
import { Tabs, type DebugTab } from "./DebuggerView/Tabs";

export default function DebuggerView() {
  const { txHash: urlHash } = useParams<{ txHash?: string }>();
  const navigate = useNavigate();
  const [txHash, setTxHash] = useState(urlHash ?? "");
  const [activeTab, setActiveTab] = useState<DebugTab>("debugger");
  const initialLoadDone = useRef(false);

  const [callTrace, setCallTrace] = useState<CallFrame | null>(null);
  const [gasProfile, setGasProfile] = useState<GasProfile | null>(null);
  const [opcodeProfile, setOpcodeProfile] = useState<OpcodeProfile | null>(null);
  const [opcodeSteps, setOpcodeSteps] = useState<OpcodeStep[]>([]);
  const [targetAddress, setTargetAddress] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugAvailable, setDebugAvailable] = useState<boolean | null>(null);
  const [hasResult, setHasResult] = useState(false);

  const isValidHash = isValidTxHash(txHash);

  // Normalize wire-format trace into the SDK's canonical TraceFrame so the
  // SDK CallTree can render it. Memoized to avoid re-walking on every render.
  const normalizedTrace = useMemo(
    () => (callTrace ? normalizeCallFrame(callTrace) : null),
    [callTrace],
  );
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
      // Fetch all three traces in parallel — no explorer dependency
      const [traceRes, gasRes, opcodeRes] = await Promise.all([
        fetchTrace(txHash),
        fetchGasProfile(txHash),
        fetchOpcodes(txHash, 50000),
      ]);

      if (traceRes.ok && traceRes.trace) {
        setCallTrace(traceRes.trace);
        setDebugAvailable(true);
        setTargetAddress(traceRes.trace.to || null);
      } else {
        setDebugAvailable(traceRes.debugAvailable ?? false);
        if (traceRes.error) setError(traceRes.error);
      }

      if (gasRes.ok && gasRes.gasProfile) {
        setGasProfile(gasRes.gasProfile);
        if (gasRes.opcodeProfile) setOpcodeProfile(gasRes.opcodeProfile);
      }

      if (opcodeRes.ok && opcodeRes.steps) setOpcodeSteps(opcodeRes.steps);

      if (
        (traceRes.ok && traceRes.trace) ||
        (gasRes.ok && gasRes.gasProfile) ||
        (opcodeRes.ok && opcodeRes.steps && opcodeRes.steps.length > 0)
      ) {
        setHasResult(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }, [txHash, isValidHash]);

  // Auto-trace when URL contains a tx hash
  useEffect(() => {
    if (urlHash && isValidTxHash(urlHash) && !initialLoadDone.current) {
      initialLoadDone.current = true;
      void handleTrace();
    }
  }, [urlHash, handleTrace]);

  const handleSubmitTrace = useCallback(() => {
    if (!isValidHash || loading) return;
    navigate(`/debugger/${txHash}`, { replace: true });
    void handleTrace();
  }, [isValidHash, loading, txHash, navigate, handleTrace]);

  return (
    <div className="space-y-6">
      <SearchBar
        txHash={txHash}
        setTxHash={setTxHash}
        isValidHash={isValidHash}
        loading={loading}
        onSubmit={handleSubmitTrace}
      />

      {loading && <LoadingPanel />}

      {!loading && error && !hasResult && (
        <ErrorPanel error={error} debugAvailable={debugAvailable} />
      )}

      {!loading && hasResult && (
        <div>
          <Tabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            opcodeStepCount={opcodeSteps.length}
            hasCallTrace={!!callTrace}
            hasGasProfile={!!gasProfile}
          />

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

      {!loading && !error && !hasResult && <EmptyState />}
    </div>
  );
}
