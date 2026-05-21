import type { SimulationResult } from "../../types";

export function LoadingPanel({ count }: { count: number }) {
  return (
    <div
      className="rounded-lg border p-8 flex flex-col items-center justify-center text-center"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <div className="spinner mb-4" />
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        Simulating {count} transaction{count !== 1 ? "s" : ""}...
      </p>
    </div>
  );
}

export function ErrorPanel({ message }: { message: string }) {
  return (
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
          <h3
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--color-danger)" }}
          >
            Bundle Simulation Error
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

export function EmptyPanel() {
  return (
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
  );
}

export function SummaryBar({ results }: { results: SimulationResult[] }) {
  const succeeded = results.filter((r) => r.success).length;
  const reverted = results.length - succeeded;
  const totalGas = results.reduce((sum, r) => sum + BigInt(r.gasUsed), 0n);

  return (
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
          {succeeded} succeeded
        </span>
        {reverted > 0 && (
          <span style={{ color: "var(--color-danger)" }}>
            {reverted} reverted
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
        {totalGas.toLocaleString()} total gas
      </span>
    </div>
  );
}
