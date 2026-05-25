import { Icon } from "@iconify/react";

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
      className="rounded-lg p-4"
      style={{
        backgroundColor: "var(--color-danger-muted)",
        borderColor: "var(--color-danger)",
      }}
    >
      <div className="flex items-start gap-row">
        <Icon
          icon="heroicons:exclamation-circle"
          className="w-5 h-5 mt-0.5 flex-shrink-0"
          style={{ color: "var(--color-danger)" }}
        />
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
