/** Centered spinner shown while debug data is being fetched. */
export function LoadingPanel() {
  return (
    <div
      className="rounded-lg bs p-12 flex flex-col items-center justify-center theme-card-bg"
    >
      <div className="spinner mb-4" />
      <p
        className="text-sm theme-text-secondary"
      >
        Tracing transaction execution...
      </p>
      <p
        className="text-xs mt-1 theme-text-muted"
      >
        This may take a moment for complex transactions.
      </p>
    </div>
  );
}
