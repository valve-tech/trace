import type { ExecutionResult } from "../../../api/actions";

export function TestResultPanel({ result }: { result: ExecutionResult }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: result.success
          ? "var(--color-success)"
          : "var(--color-danger)",
        backgroundColor: result.success
          ? "var(--color-success-muted)"
          : "var(--color-danger-muted)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-sm font-medium"
          style={{
            color: result.success
              ? "var(--color-success)"
              : "var(--color-danger)",
          }}
        >
          Test {result.success ? "Passed" : "Failed"}
        </span>
        <span
          className="text-xs"
          style={{
            color: "var(--color-text-secondary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {result.duration_ms}ms
        </span>
      </div>
      {result.stdout && (
        <pre
          className="text-xs p-2 rounded mt-2 overflow-x-auto"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {result.stdout}
        </pre>
      )}
      {result.stderr && (
        <pre
          className="text-xs p-2 rounded mt-2 overflow-x-auto"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            color: "var(--color-danger)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {result.stderr}
        </pre>
      )}
      {result.error && (
        <p className="text-xs mt-2" style={{ color: "var(--color-danger)" }}>
          Error: {result.error}
        </p>
      )}
    </div>
  );
}
