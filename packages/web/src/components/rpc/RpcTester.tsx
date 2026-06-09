import { useState, useEffect, useCallback } from "react";
import { testRpcRequest, type JsonRpcRequest, type RpcTestResponse } from "../../api/rpc";
import { useActiveChainId } from "../../lib/activeChain";

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

interface Template {
  label: string;
  request: JsonRpcRequest;
}

const TEMPLATES: Template[] = [
  {
    label: "eth_blockNumber",
    request: { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
  },
  {
    label: "eth_chainId",
    request: { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
  },
  {
    label: "eth_gasPrice",
    request: { jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] },
  },
  {
    label: "eth_getBalance",
    request: {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: ["0x0000000000000000000000000000000000000000", "latest"],
    },
  },
  {
    label: "eth_getCode",
    request: {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getCode",
      params: ["0x0000000000000000000000000000000000000000", "latest"],
    },
  },
  {
    label: "net_version",
    request: { jsonrpc: "2.0", id: 1, method: "net_version", params: [] },
  },
  {
    label: "valve_simulateTransaction",
    request: {
      jsonrpc: "2.0",
      id: 1,
      method: "valve_simulateTransaction",
      params: [
        {
          from: "0x0000000000000000000000000000000000000001",
          to: "0x0000000000000000000000000000000000000002",
          value: "0x0",
        },
      ],
    },
  },
  {
    label: "valve_simulateBundle",
    request: {
      jsonrpc: "2.0",
      id: 1,
      method: "valve_simulateBundle",
      params: [
        {
          transactions: [
            {
              from: "0x0000000000000000000000000000000000000001",
              to: "0x0000000000000000000000000000000000000002",
              value: "0x0",
            },
          ],
        },
      ],
    },
  },
  {
    label: "valve_decodeTransaction",
    request: {
      jsonrpc: "2.0",
      id: 1,
      method: "valve_decodeTransaction",
      params: ["0x0000000000000000000000000000000000000000000000000000000000000000"],
    },
  },
  {
    label: "valve_getAssetChanges",
    request: {
      jsonrpc: "2.0",
      id: 1,
      method: "valve_getAssetChanges",
      params: [
        {
          from: "0x0000000000000000000000000000000000000001",
          to: "0x0000000000000000000000000000000000000002",
          value: "0x0",
        },
      ],
    },
  },
  {
    label: "Batch: blockNumber + chainId",
    request: [
      { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_chainId", params: [] },
    ] as unknown as JsonRpcRequest,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RpcTesterProps {
  /** Optionally pre-fill the request editor (e.g. from "Try it" in MethodExplorer) */
  initialRequest?: JsonRpcRequest | null;
}

export default function RpcTester({ initialRequest }: RpcTesterProps) {
  const chainId = useActiveChainId();
  const [requestText, setRequestText] = useState<string>(
    initialRequest
      ? JSON.stringify(initialRequest, null, 2)
      : JSON.stringify(TEMPLATES[0]!.request, null, 2),
  );
  const [response, setResponse] = useState<RpcTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Update when initialRequest changes externally
  const handleSetInitialRequest = useCallback(
    (req: JsonRpcRequest) => {
      setRequestText(JSON.stringify(req, null, 2));
      setResponse(null);
      setError(null);
    },
    [],
  );

  useEffect(() => {
    if (initialRequest) {
      handleSetInitialRequest(initialRequest);
    }
  }, [initialRequest, handleSetInitialRequest]);

  const handleTemplateSelect = (template: Template) => {
    setRequestText(JSON.stringify(template.request, null, 2));
    setResponse(null);
    setError(null);
  };

  const handleSend = async () => {
    setError(null);
    setResponse(null);
    setSending(true);

    try {
      let parsed: JsonRpcRequest | JsonRpcRequest[];
      try {
        parsed = JSON.parse(requestText);
      } catch {
        setError("Invalid JSON. Please check your request syntax.");
        setSending(false);
        return;
      }

      const result = await testRpcRequest(parsed, chainId);
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  // Card surface: theme-card-bg + bs class composes background + outline.
  // Use as a className alongside the layout/rounded classes.
  const cardClass = "theme-card-bg bs";

  // Format the response JSON with syntax coloring via a simple pre block
  const responseText = response
    ? JSON.stringify(response.response, null, 2)
    : null;

  const hasError = response?.response
    ? Array.isArray(response.response)
      ? response.response.some((r) => r.error)
      : (response.response as { error?: unknown }).error
    : false;

  return (
    <div className="space-y-stack">
      {/* Template selector */}
      <div className={`rounded-lg p-4 ${cardClass}`}>
        <div className="text-xs font-medium mb-2 theme-text-secondary">
          Templates
        </div>
        <div className="flex flex-wrap gap-inline">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => handleTemplateSelect(t)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:opacity-80 theme-secondary-bg ${t.label.startsWith("valve_") ? "theme-accent" : "theme-text-secondary"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Request editor */}
      <div className={`rounded-lg overflow-hidden ${cardClass}`}>
        <div className="px-4 py-2.5 bs-b flex items-center justify-between">
          <span className="text-sm font-semibold theme-text">
            Request
          </span>
          <span className="text-xs theme-text-secondary">
            Ctrl+Enter to send
          </span>
        </div>
        <textarea
          value={requestText}
          onChange={(e) => setRequestText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={12}
          spellCheck={false}
          className="w-full px-4 py-3 text-sm font-mono resize-y border-none outline-none theme-secondary-bg theme-text"
          style={{ minHeight: "120px" }}
        />
        <div className="px-4 py-3 bs-t flex items-center gap-row">
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              backgroundColor: sending
                ? "var(--color-border-default)"
                : "var(--color-accent)",
              color: "white",
              cursor: sending ? "not-allowed" : "pointer",
              opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? "Sending..." : "Send Request"}
          </button>
          {response && (
            <span className="text-xs theme-text-secondary">
              {response.latencyMs}ms
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-lg p-4 text-sm theme-card-bg theme-danger"
          style={{ borderColor: "var(--color-danger)" }}
        >
          {error}
        </div>
      )}

      {/* Response */}
      {responseText && (
        <div className={`rounded-lg overflow-hidden ${cardClass}`}>
          <div className="px-4 py-2.5 bs-b flex items-center justify-between">
            <span className="text-sm font-semibold theme-text">
              Response
            </span>
            <div className="flex items-center gap-row">
              {hasError ? (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium theme-danger"
                  style={{ backgroundColor: "rgba(239,68,68,0.15)" }}
                >
                  Error
                </span>
              ) : (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium theme-success"
                  style={{ backgroundColor: "rgba(34,197,94,0.15)" }}
                >
                  Success
                </span>
              )}
              <span className="text-xs font-medium theme-text-secondary">
                {response!.latencyMs}ms
              </span>
            </div>
          </div>
          <pre
            className={`px-4 py-3 text-xs font-mono overflow-x-auto theme-secondary-bg ${hasError ? "theme-danger" : "theme-text"}`}
            style={{ maxHeight: "400px", overflowY: "auto" }}
          >
            {responseText}
          </pre>
        </div>
      )}
    </div>
  );
}
