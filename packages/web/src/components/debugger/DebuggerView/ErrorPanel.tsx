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
      className="rounded-lg p-4 theme-danger-bg"
      style={{ borderColor: "var(--color-danger)" }}
    >
      <div className="flex items-start gap-row">
        <Icon
          icon="heroicons:exclamation-circle"
          className="w-5 h-5 mt-0.5 flex-shrink-0 theme-danger"
        />
        <div>
          <h3 className="text-sm font-semibold mb-1 theme-danger">
            {debugAvailable === false
              ? "Debug API Not Available"
              : "Trace Error"}
          </h3>
          <p className="text-sm theme-text">{error}</p>
          {debugAvailable === false && (
            <div className="mt-3 p-3 rounded text-xs space-y-1 theme-primary-bg theme-text-secondary">
              <p className="font-semibold theme-text">
                How to enable debug tracing:
              </p>
              <p>
                1. Run a PulseChain node (Geth/Erigon) with <code className="theme-mono">--http.api=eth,debug,net</code>
              </p>
              <p>
                2. Set the <code className="theme-mono">DEBUG_RPC_URL</code> environment variable to your node's URL
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
