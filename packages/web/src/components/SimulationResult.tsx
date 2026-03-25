import type { SimulationResult } from "../types";

interface SimulationResultPanelProps {
  result: SimulationResult | null;
  loading: boolean;
  error: string | null;
}

function StatusBadge({ success }: { success: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold"
      style={{
        backgroundColor: success
          ? "var(--color-success-muted)"
          : "var(--color-danger-muted)",
        color: success ? "var(--color-success)" : "var(--color-danger)",
      }}
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{
          backgroundColor: success ? "var(--color-success)" : "var(--color-danger)",
        }}
      />
      {success ? "Success" : "Reverted"}
    </span>
  );
}

function DataRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-1 py-2.5 border-b last:border-b-0"
      style={{ borderColor: "var(--color-border-muted)" }}
    >
      <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </span>
      <span
        className={`text-sm break-all ${mono ? "" : ""}`}
        style={{
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          color: "var(--color-text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-lg border p-8 flex flex-col items-center justify-center text-center min-h-[400px]"
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
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <h3 className="text-sm font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
        No Simulation Results
      </h3>
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        Configure and run a transaction simulation to see results here.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      className="rounded-lg border p-8 flex flex-col items-center justify-center text-center min-h-[400px]"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <div className="spinner mb-4" />
      <h3 className="text-sm font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
        Simulating Transaction...
      </h3>
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        Running against PulseChain state
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg border p-6"
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
            Simulation Error
          </h3>
          <p
            className="text-sm break-all"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-secondary)",
            }}
          >
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SimulationResultPanel({
  result,
  loading,
  error,
}: SimulationResultPanelProps) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!result) return <EmptyState />;

  return (
    <div className="space-y-4">
      {/* Status card */}
      <div
        className="rounded-lg border p-4"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Simulation Result
          </h2>
          <StatusBadge success={result.success} />
        </div>

        <div>
          <DataRow label="Gas Used" value={BigInt(result.gasUsed).toLocaleString()} />

          {result.returnData && result.returnData !== "0x" && (
            <DataRow label="Return Data (raw)" value={result.returnData} mono />
          )}

          {result.revertReason && (
            <div
              className="mt-3 p-3 rounded-md"
              style={{ backgroundColor: "var(--color-danger-muted)" }}
            >
              <span
                className="text-xs font-medium block mb-1"
                style={{ color: "var(--color-danger)" }}
              >
                Revert Reason
              </span>
              <span
                className="text-sm break-all"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-primary)",
                }}
              >
                {result.revertReason}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Decoded function call */}
      {result.decodedCall && (
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <h3
            className="text-sm font-semibold mb-3 pb-2 border-b"
            style={{
              color: "var(--color-text-primary)",
              borderColor: "var(--color-border-muted)",
            }}
          >
            Decoded Function Call
          </h3>
          <div
            className="px-3 py-2 rounded-md mb-3 text-sm"
            style={{
              fontFamily: "var(--font-mono)",
              backgroundColor: "var(--color-accent-muted)",
              color: "var(--color-accent)",
            }}
          >
            {result.decodedCall.functionName}(
            {result.decodedCall.params.map((p) => p.type).join(", ")})
          </div>
          <div className="space-y-1">
            {result.decodedCall.params.map((param, i) => (
              <div
                key={i}
                className="flex items-start gap-3 py-1.5 text-sm"
              >
                <span
                  className="shrink-0 font-medium"
                  style={{ color: "var(--color-accent)" }}
                >
                  {param.name || `param${i}`}
                </span>
                <span style={{ color: "var(--color-text-muted)" }}>
                  ({param.type})
                </span>
                <span
                  className="break-all"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  {param.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decoded return value */}
      {result.decodedReturn && result.decodedReturn.values.length > 0 && (
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <h3
            className="text-sm font-semibold mb-3 pb-2 border-b"
            style={{
              color: "var(--color-text-primary)",
              borderColor: "var(--color-border-muted)",
            }}
          >
            Decoded Return Value
          </h3>
          <div className="space-y-1">
            {result.decodedReturn.values.map((val, i) => (
              <div key={i} className="flex items-start gap-3 py-1.5 text-sm">
                <span
                  className="shrink-0 font-medium"
                  style={{ color: "var(--color-success)" }}
                >
                  {val.name || `output${i}`}
                </span>
                <span style={{ color: "var(--color-text-muted)" }}>
                  ({val.type})
                </span>
                <span
                  className="break-all"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  {val.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event logs */}
      {result.logs && result.logs.length > 0 && (
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <h3
            className="text-sm font-semibold mb-3 pb-2 border-b"
            style={{
              color: "var(--color-text-primary)",
              borderColor: "var(--color-border-muted)",
            }}
          >
            Event Logs ({result.logs.length})
          </h3>
          <div className="space-y-3">
            {result.logs.map((log, i) => (
              <div
                key={i}
                className="rounded-md border p-3"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  borderColor: "var(--color-border-muted)",
                }}
              >
                {log.decoded ? (
                  <div>
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--color-warning)" }}
                    >
                      {log.decoded.eventName}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {log.decoded.params.map((p, j) => (
                        <div key={j} className="text-xs flex gap-2">
                          <span style={{ color: "var(--color-text-secondary)" }}>
                            {p.name}:
                          </span>
                          <span
                            className="break-all"
                            style={{
                              fontFamily: "var(--font-mono)",
                              color: "var(--color-text-primary)",
                            }}
                          >
                            {p.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <DataRow label="Address" value={log.address} mono />
                    <DataRow label="Data" value={log.data} mono />
                    {log.topics.map((t, j) => (
                      <DataRow key={j} label={`Topic ${j}`} value={t} mono />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
