import { useState, useEffect } from "react";
import {
  fetchRpcMethods,
  type MethodDescription,
} from "../../api/rpc";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MethodExplorerProps {
  onTryMethod?: (method: MethodDescription) => void;
}

export default function MethodExplorer({ onTryMethod }: MethodExplorerProps) {
  const [methods, setMethods] = useState<MethodDescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMethod, setExpandedMethod] = useState<string | null>(null);

  useEffect(() => {
    fetchRpcMethods()
      .then((res) => {
        setMethods(res.methods);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load methods");
        setLoading(false);
      });
  }, []);

  // Group by namespace
  const grouped = methods.reduce<Record<string, MethodDescription[]>>(
    (acc, m) => {
      const ns = m.namespace;
      if (!acc[ns]) acc[ns] = [];
      acc[ns]!.push(m);
      return acc;
    },
    {},
  );

  // Order: valve namespace first, then alphabetical
  const namespaces = Object.keys(grouped).sort((a, b) => {
    if (a === "valve") return -1;
    if (b === "valve") return 1;
    return a.localeCompare(b);
  });

  const cardStyle = {
    backgroundColor: "var(--color-bg-card)",
    boxShadow: "0 0 0 1px var(--color-border-default)",
  };

  const labelStyle = { color: "var(--color-text-secondary)" };

  if (loading) {
    return (
      <div className="text-sm p-8 text-center" style={labelStyle}>
        Loading methods...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm p-8 text-center theme-danger">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-section">
      {namespaces.map((ns) => (
        <div key={ns} className="rounded-lg overflow-hidden" style={cardStyle}>
          {/* Namespace header */}
          <div
            className="px-4 py-3 bs-b flex items-center gap-inline"
            style={{}}
          >
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider"
              style={{
                backgroundColor:
                  ns === "valve"
                    ? "var(--color-accent-muted, rgba(139,92,246,0.15))"
                    : "var(--color-bg-secondary)",
                color:
                  ns === "valve"
                    ? "var(--color-accent)"
                    : "var(--color-text-secondary)",
              }}
            >
              {ns}_
            </span>
            <span
              className="text-sm font-semibold theme-text"
            >
              {ns === "valve"
                ? "PulseDev Custom Methods"
                : ns === "eth"
                  ? "Ethereum Standard Methods"
                  : ns === "net"
                    ? "Network Methods"
                    : "Web3 Methods"}
            </span>
            <span className="text-xs ml-auto" style={labelStyle}>
              {grouped[ns]!.length} method{grouped[ns]!.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Method list */}
          <div>
            {grouped[ns]!.map((method) => {
              const isExpanded = expandedMethod === method.name;
              return (
                <div
                  key={method.name}
                  className="bs-b last:shadow-none"
                  style={{}}
                >
                  {/* Accordion header */}
                  <button
                    onClick={() =>
                      setExpandedMethod(isExpanded ? null : method.name)
                    }
                    className="w-full text-left px-4 py-3 flex items-center gap-row hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: "transparent" }}
                  >
                    <span
                      className="text-xs transition-transform"
                      style={{
                        color: "var(--color-text-muted)",
                        transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        display: "inline-block",
                      }}
                    >
                      &#9654;
                    </span>
                    <span
                      className="font-mono text-sm font-medium"
                      style={{
                        color:
                          ns === "valve"
                            ? "var(--color-accent)"
                            : "var(--color-text-primary)",
                      }}
                    >
                      {method.name}
                    </span>
                    <span className="text-xs truncate" style={labelStyle}>
                      {method.description}
                    </span>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div
                      className="px-4 pb-4 pt-0 space-y-3"
                      style={{ paddingLeft: "2.5rem" }}
                    >
                      <div>
                        <div
                          className="text-xs font-medium mb-1"
                          style={labelStyle}
                        >
                          Description
                        </div>
                        <div
                          className="text-sm theme-text"
                        >
                          {method.description}
                        </div>
                      </div>

                      <div>
                        <div
                          className="text-xs font-medium mb-1"
                          style={labelStyle}
                        >
                          Parameters
                        </div>
                        <div
                          className="text-sm font-mono px-3 py-2 rounded"
                          style={{
                            backgroundColor: "var(--color-bg-secondary)",
                            color: "var(--color-text-primary)",
                          }}
                        >
                          {method.params}
                        </div>
                      </div>

                      <div>
                        <div
                          className="text-xs font-medium mb-1"
                          style={labelStyle}
                        >
                          Example Request
                        </div>
                        <pre
                          className="text-xs px-3 py-2 rounded overflow-x-auto"
                          style={{
                            backgroundColor: "var(--color-bg-secondary)",
                            color: "var(--color-text-primary)",
                          }}
                        >
                          {JSON.stringify(method.example.request, null, 2)}
                        </pre>
                      </div>

                      <div>
                        <div
                          className="text-xs font-medium mb-1"
                          style={labelStyle}
                        >
                          Example Response
                        </div>
                        <pre
                          className="text-xs px-3 py-2 rounded overflow-x-auto"
                          style={{
                            backgroundColor: "var(--color-bg-secondary)",
                            color: "var(--color-text-primary)",
                          }}
                        >
                          {JSON.stringify(method.example.response, null, 2)}
                        </pre>
                      </div>

                      {onTryMethod && (
                        <button
                          onClick={() => onTryMethod(method)}
                          className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                          style={{
                            backgroundColor: "var(--color-accent)",
                            color: "white",
                          }}
                        >
                          Try it
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
