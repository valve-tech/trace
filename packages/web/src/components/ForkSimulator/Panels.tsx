export function LoadingPanel() {
  return (
    <div
      className="rounded-lg border p-8 flex flex-col items-center"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <div className="spinner mb-3" />
      <p
        className="text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Spinning up Anvil fork and executing transaction...
      </p>
      <p
        className="text-xs mt-1"
        style={{ color: "var(--color-text-muted)" }}
      >
        This captures full state diffs — may take a few seconds.
      </p>
    </div>
  );
}

export function ErrorPanel({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "var(--color-danger-muted)",
        borderColor: "var(--color-danger)",
      }}
    >
      <p
        className="text-sm font-semibold"
        style={{ color: "var(--color-danger)" }}
      >
        Simulation Failed
      </p>
      <p
        className="text-sm mt-1"
        style={{ color: "var(--color-text-primary)" }}
      >
        {message}
      </p>
    </div>
  );
}

export function RevertReasonBlock({ reason }: { reason: string }) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        backgroundColor: "var(--color-danger-muted)",
        borderColor: "var(--color-danger)",
      }}
    >
      <p
        className="text-xs font-semibold mb-1"
        style={{ color: "var(--color-danger)" }}
      >
        Revert Reason
      </p>
      <pre
        className="text-xs whitespace-pre-wrap"
        style={{
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {reason}
      </pre>
    </div>
  );
}

export function NoStateChangesPanel() {
  return (
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
  );
}
