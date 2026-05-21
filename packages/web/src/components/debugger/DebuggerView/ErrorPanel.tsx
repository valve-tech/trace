/** Error card. Shows the failure reason and — when the backend reported
 *  `debugAvailable === false` — embeds 3-line setup instructions for
 *  enabling `debug_*` RPC methods on the user's PulseChain node. */
export function ErrorPanel({
  error,
  debugAvailable,
}: {
  error: string;
  debugAvailable: boolean | null;
}) {
  return (
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
  );
}
