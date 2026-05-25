import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { recordDebuggerTx } from "../../lib/recentDebuggerTxs";
import { recordVisit } from "../../lib/recentEntities";
import GasProfiler from "./GasProfiler";
import StepDebugger from "./StepDebugger";
import { isValidTxHash } from "./DebuggerView/validation";
import { SearchBar } from "./DebuggerView/SearchBar";
import { LoadingPanel } from "./DebuggerView/LoadingPanel";
import { ErrorPanel } from "./DebuggerView/ErrorPanel";
import { EmptyState } from "./DebuggerView/EmptyState";
import { NoDataPanel } from "./DebuggerView/NoDataPanel";
import { Tabs, type DebugTab } from "./DebuggerView/Tabs";

interface DebuggerData {
  callTrace: CallFrame | null;
  gasProfile: GasProfile | null;
  opcodeProfile: OpcodeProfile | null;
  opcodeSteps: OpcodeStep[];
  targetAddress: string | null;
  debugAvailable: boolean;
  error: string | null;
}

/**
 * Fetch all three trace endpoints once and fold them into a single payload.
 * Returned (not thrown) so partial results and the "no debug node" state are
 * cached by TanStack Query — which persists to IndexedDB, so a reload of the
 * same tx serves instantly from cache instead of re-hitting the backend.
 */
async function fetchDebuggerData(hash: string): Promise<DebuggerData> {
  const [traceRes, gasRes, opcodeRes] = await Promise.all([
    fetchTrace(hash),
    fetchGasProfile(hash),
    fetchOpcodes(hash, 50000),
  ]);

  const data: DebuggerData = {
    callTrace: null,
    gasProfile: null,
    opcodeProfile: null,
    opcodeSteps: [],
    targetAddress: null,
    debugAvailable: false,
    error: null,
  };

  if (traceRes.ok && traceRes.trace) {
    data.callTrace = traceRes.trace;
    data.debugAvailable = true;
    data.targetAddress = traceRes.trace.to || null;
  } else {
    data.debugAvailable = traceRes.debugAvailable ?? false;
    if (traceRes.error) data.error = traceRes.error;
  }

  if (gasRes.ok && gasRes.gasProfile) {
    data.gasProfile = gasRes.gasProfile;
    if (gasRes.opcodeProfile) data.opcodeProfile = gasRes.opcodeProfile;
  }

  if (opcodeRes.ok && opcodeRes.steps) data.opcodeSteps = opcodeRes.steps;

  return data;
}

export default function DebuggerView() {
  const { txHash: urlHash } = useParams<{ txHash?: string }>();
  const navigate = useNavigate();
  const [txHash, setTxHash] = useState(urlHash ?? "");
  const [activeTab, setActiveTab] = useState<DebugTab>("debugger");

  // Keep the search input in sync when the route hash changes (e.g. ⌘K nav).
  useEffect(() => {
    if (urlHash) setTxHash(urlHash);
  }, [urlHash]);

  const validUrlHash = urlHash && isValidTxHash(urlHash) ? urlHash : null;

  // The whole trace is one cache entry, keyed by hash. staleTime Infinity +
  // the persisted client mean a revisit/reload reads it from IndexedDB.
  const query = useQuery({
    queryKey: ["debugger-trace", validUrlHash],
    queryFn: () => fetchDebuggerData(validUrlHash!),
    enabled: !!validUrlHash,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const data = query.data ?? null;
  // Only a true first load (nothing cached yet) shows the loading panel; a
  // cache hit hydrates synchronously and skips it.
  const loading = query.isFetching && !data;
  const hasResult =
    !!data &&
    (!!data.callTrace || !!data.gasProfile || data.opcodeSteps.length > 0);
  const error =
    data?.error ?? (query.error instanceof Error ? query.error.message : null);
  const debugAvailable = data?.debugAvailable ?? null;

  const callTrace = data?.callTrace ?? null;
  const gasProfile = data?.gasProfile ?? null;
  const opcodeProfile = data?.opcodeProfile ?? null;
  const opcodeSteps = useMemo(() => data?.opcodeSteps ?? [], [data]);
  const targetAddress = data?.targetAddress ?? null;

  // Record into recents whenever a result is shown — including cache hits.
  useEffect(() => {
    if (validUrlHash && hasResult) {
      recordDebuggerTx(validUrlHash);
      recordVisit({ kind: "tx", value: validUrlHash });
    }
  }, [validUrlHash, hasResult]);

  const isValidHash = isValidTxHash(txHash);

  // Normalize wire-format trace into the SDK's canonical TraceFrame. Memoized
  // to avoid re-walking on every render.
  const normalizedTrace = useMemo(
    () => (callTrace ? normalizeCallFrame(callTrace) : null),
    [callTrace],
  );
  const normalizedSteps = useMemo(
    () => normalizeStructLogs(opcodeSteps),
    [opcodeSteps],
  );

  // Submitting the search box just navigates; the query fires off the new hash.
  const handleSubmitTrace = () => {
    if (!isValidHash) return;
    navigate(`/debugger/${txHash}`, { replace: true });
  };

  return (
    <div className="space-y-section">
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
        <div className="card overflow-hidden">
          <Tabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            opcodeStepCount={opcodeSteps.length}
            hasCallTrace={!!callTrace}
            hasGasProfile={!!gasProfile}
          />

          <div className="p-4">
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
              <div className="space-y-stack">
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
