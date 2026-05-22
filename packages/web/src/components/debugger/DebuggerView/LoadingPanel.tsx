/** Centered spinner shown while debug data is being fetched. */
export function LoadingPanel() {
  return (
    <div
      className="rounded-lg bs p-12 flex flex-col items-center justify-center"
      style={{
        backgroundColor: "var(--color-bg-card)",
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
  );
}
