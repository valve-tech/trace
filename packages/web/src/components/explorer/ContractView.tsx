import { useState, useEffect, useCallback } from "react";
import { fetchContractInfo, type ContractInfo } from "../../api/explorer";

interface ContractViewProps {
  address: string;
  onNavigate: (target: { type: "address"; value: string }) => void;
}

interface AbiItem {
  type: string;
  name?: string;
  inputs?: Array<{ name: string; type: string; components?: unknown[] }>;
  outputs?: Array<{ name: string; type: string }>;
  stateMutability?: string;
  constant?: boolean;
}

type SubTab = "abi" | "source" | "read" | "write";

function ReadFunction({
  fn,
  address,
}: {
  fn: AbiItem;
  address: string;
}) {
  const [args, setArgs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleCall = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Build calldata from ABI function and args using the simulate endpoint
      const inputs = fn.inputs || [];
      const argValues = inputs.map((inp) => {
        const val = args[inp.name] || "";
        // Try to parse as number if the type is uint/int
        if (inp.type.startsWith("uint") || inp.type.startsWith("int")) {
          return val;
        }
        if (inp.type === "bool") {
          return val.toLowerCase() === "true";
        }
        return val;
      });

      // Use the simulate endpoint to call the read function
      const payload: Record<string, unknown> = {
        from: "0x0000000000000000000000000000000000000000",
        to: address,
        data: "0x", // We'll encode below
        abi: [fn],
      };

      // Encode the function call using viem encoding
      // For simplicity, we'll use the simulate endpoint which handles encoding
      // Build a simplified ABI-encoded call
      const { encodeFunctionData } = await import("viem");
      const data = encodeFunctionData({
        abi: [fn] as any,
        functionName: fn.name!,
        args: argValues as any,
      });

      payload.data = data;

      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (json.ok && json.result) {
        if (json.result.decodedOutput) {
          const values = json.result.decodedOutput.values || [];
          setResult(
            values
              .map(
                (v: { name: string; type: string; value: unknown }) =>
                  `${v.name || "result"} (${v.type}): ${typeof v.value === "object" ? JSON.stringify(v.value) : String(v.value)}`,
              )
              .join("\n"),
          );
        } else if (json.result.returnData) {
          setResult(json.result.returnData);
        } else {
          setResult("(empty result)");
        }
      } else {
        setError(json.result?.revertReason || json.error || "Call failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Call failed");
    } finally {
      setLoading(false);
    }
  }, [fn, args, address]);

  const inputs = fn.inputs || [];
  const outputs = fn.outputs || [];

  return (
    <div
      className="rounded-md border"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border-muted)",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--color-accent)" }}
          >
            {fn.name}
          </span>
          <span
            className="text-[10px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            ({inputs.map((i) => i.type).join(", ")})
            {outputs.length > 0 &&
              ` -> (${outputs.map((o) => o.type).join(", ")})`}
          </span>
        </div>
        <svg
          className="w-3.5 h-3.5 transition-transform"
          style={{
            color: "var(--color-text-muted)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div
          className="px-3 pb-3 border-t pt-3"
          style={{ borderColor: "var(--color-border-muted)" }}
        >
          {inputs.length > 0 && (
            <div className="space-y-2 mb-3">
              {inputs.map((inp, i) => (
                <div key={i}>
                  <label
                    className="text-xs font-medium block mb-1"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {inp.name}{" "}
                    <span style={{ color: "var(--color-text-muted)" }}>
                      ({inp.type})
                    </span>
                  </label>
                  <input
                    type="text"
                    value={args[inp.name] || ""}
                    onChange={(e) =>
                      setArgs((prev) => ({
                        ...prev,
                        [inp.name]: e.target.value,
                      }))
                    }
                    placeholder={inp.type}
                    className="w-full px-2.5 py-1.5 rounded border text-xs"
                    style={{
                      fontFamily: "var(--font-mono)",
                      backgroundColor: "var(--color-bg-input)",
                      borderColor: "var(--color-border-default)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleCall}
            disabled={loading}
            className="px-3 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer"
            style={{
              backgroundColor: loading
                ? "var(--color-border-default)"
                : "var(--color-accent)",
              color: loading ? "var(--color-text-muted)" : "white",
            }}
          >
            {loading ? "Querying..." : "Query"}
          </button>

          {result !== null && (
            <div
              className="mt-2 rounded-md p-2.5 text-xs font-mono break-all"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-success)",
              }}
            >
              {result}
            </div>
          )}

          {error && (
            <div
              className="mt-2 rounded-md p-2.5 text-xs font-mono"
              style={{
                backgroundColor: "var(--color-danger-muted)",
                color: "var(--color-danger)",
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WriteFunction({ fn }: { fn: AbiItem }) {
  const [expanded, setExpanded] = useState(false);
  const inputs = fn.inputs || [];

  return (
    <div
      className="rounded-md border"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border-muted)",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--color-warning)" }}
          >
            {fn.name}
          </span>
          <span
            className="text-[10px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            ({inputs.map((i) => i.type).join(", ")})
          </span>
          {fn.stateMutability === "payable" && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase"
              style={{
                backgroundColor: "var(--color-warning-muted)",
                color: "var(--color-warning)",
              }}
            >
              payable
            </span>
          )}
        </div>
        <svg
          className="w-3.5 h-3.5 transition-transform"
          style={{
            color: "var(--color-text-muted)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div
          className="px-3 pb-3 border-t pt-3"
          style={{ borderColor: "var(--color-border-muted)" }}
        >
          {inputs.length > 0 && (
            <div className="space-y-2 mb-3">
              {inputs.map((inp, i) => (
                <div key={i}>
                  <label
                    className="text-xs font-medium block mb-1"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {inp.name}{" "}
                    <span style={{ color: "var(--color-text-muted)" }}>
                      ({inp.type})
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder={inp.type}
                    disabled
                    className="w-full px-2.5 py-1.5 rounded border text-xs"
                    style={{
                      fontFamily: "var(--font-mono)",
                      backgroundColor: "var(--color-bg-input)",
                      borderColor: "var(--color-border-default)",
                      color: "var(--color-text-muted)",
                      opacity: 0.6,
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          <div
            className="text-xs rounded-md p-2"
            style={{
              backgroundColor: "var(--color-warning-muted)",
              color: "var(--color-warning)",
            }}
          >
            Write functions require a connected wallet to execute. Use the Simulator tab to test this function.
          </div>
        </div>
      )}
    </div>
  );
}

export default function ContractView({
  address,
  onNavigate,
}: ContractViewProps) {
  const [info, setInfo] = useState<ContractInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("read");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchContractInfo(address)
      .then((data) => {
        if (!cancelled) {
          setInfo(data);
          // Auto-select best tab
          if (data.abi && (data.abi as AbiItem[]).some((f) => f.type === "function")) {
            setSubTab("read");
          } else if (data.sourceCode) {
            setSubTab("source");
          } else {
            setSubTab("abi");
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  if (loading) {
    return (
      <div
        className="rounded-lg border p-8 flex flex-col items-center justify-center min-h-[300px]"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
        }}
      >
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mb-3"
          style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
        />
        <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Loading contract...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-danger)",
        }}
      >
        <h3
          className="text-sm font-semibold mb-1"
          style={{ color: "var(--color-danger)" }}
        >
          Error
        </h3>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!info) return null;

  const abiItems = (info.abi || []) as AbiItem[];
  const readFunctions = abiItems.filter(
    (f) =>
      f.type === "function" &&
      (f.stateMutability === "view" || f.stateMutability === "pure" || f.constant),
  );
  const writeFunctions = abiItems.filter(
    (f) =>
      f.type === "function" &&
      f.stateMutability !== "view" &&
      f.stateMutability !== "pure" &&
      !f.constant,
  );

  return (
    <div className="space-y-4">
      {/* Contract header */}
      <div
        className="rounded-lg border p-4"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2
                className="text-sm font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                Contract
              </h2>
              {info.isVerified ? (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                  style={{
                    backgroundColor: "var(--color-success-muted)",
                    color: "var(--color-success)",
                  }}
                >
                  Verified
                </span>
              ) : (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                  style={{
                    backgroundColor: "var(--color-warning-muted)",
                    color: "var(--color-warning)",
                  }}
                >
                  Unverified
                </span>
              )}
            </div>
            <span
              className="font-mono text-sm break-all"
              style={{ color: "var(--color-text-primary)" }}
            >
              {address}
            </span>
            {info.contractName && (
              <div className="mt-1">
                <span
                  className="text-xs"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {info.contractName}
                </span>
                {info.compilerVersion && (
                  <span
                    className="text-xs ml-2"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    ({info.compilerVersion})
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => onNavigate({ type: "address", value: address })}
            className="text-xs font-medium hover:underline cursor-pointer shrink-0"
            style={{ color: "var(--color-accent)" }}
          >
            View Address
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div
        className="flex gap-0 border-b"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        {(["read", "write", "abi", "source"] as SubTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize"
            style={{
              borderColor:
                subTab === tab ? "var(--color-accent)" : "transparent",
              color:
                subTab === tab
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              backgroundColor: "transparent",
            }}
          >
            {tab === "read"
              ? `Read (${readFunctions.length})`
              : tab === "write"
                ? `Write (${writeFunctions.length})`
                : tab === "source"
                  ? "Source"
                  : "ABI"}
          </button>
        ))}
      </div>

      {/* Read functions */}
      {subTab === "read" && (
        <div className="space-y-2">
          {readFunctions.length === 0 ? (
            <div
              className="rounded-lg border p-6 text-center text-sm"
              style={{
                backgroundColor: "var(--color-bg-card)",
                borderColor: "var(--color-border-default)",
                color: "var(--color-text-muted)",
              }}
            >
              No read functions available
            </div>
          ) : (
            readFunctions.map((fn, i) => (
              <ReadFunction key={i} fn={fn} address={address} />
            ))
          )}
        </div>
      )}

      {/* Write functions */}
      {subTab === "write" && (
        <div className="space-y-2">
          {writeFunctions.length === 0 ? (
            <div
              className="rounded-lg border p-6 text-center text-sm"
              style={{
                backgroundColor: "var(--color-bg-card)",
                borderColor: "var(--color-border-default)",
                color: "var(--color-text-muted)",
              }}
            >
              No write functions available
            </div>
          ) : (
            writeFunctions.map((fn, i) => (
              <WriteFunction key={i} fn={fn} />
            ))
          )}
        </div>
      )}

      {/* ABI */}
      {subTab === "abi" && (
        <div
          className="rounded-lg border overflow-hidden"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
          }}
        >
          {info.abi ? (
            <div
              className="p-4 text-xs font-mono overflow-x-auto max-h-[600px] overflow-y-auto"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
              }}
            >
              <pre className="whitespace-pre-wrap break-all">
                {JSON.stringify(info.abi, null, 2)}
              </pre>
            </div>
          ) : (
            <div
              className="p-6 text-center text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              ABI not available (contract not verified)
            </div>
          )}
        </div>
      )}

      {/* Source code */}
      {subTab === "source" && (
        <div
          className="rounded-lg border overflow-hidden"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
          }}
        >
          {info.sourceCode ? (
            <div
              className="p-4 text-xs font-mono overflow-x-auto max-h-[600px] overflow-y-auto"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
              }}
            >
              <pre className="whitespace-pre-wrap">{info.sourceCode}</pre>
            </div>
          ) : (
            <div
              className="p-6 text-center text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              Source code not available (contract not verified)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
