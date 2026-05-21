import { useCallback, useState } from "react";
import { Icon } from "@iconify/react";
import type { AbiItem } from "./types";
import { callReadFunction } from "./callReadFunction";

export function ReadFunction({
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

    const outcome = await callReadFunction(fn, address, args);
    if (outcome.ok) setResult(outcome.result);
    else setError(outcome.error);
    setLoading(false);
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
        <Icon
          icon="heroicons:chevron-down"
          className="w-3.5 h-3.5 transition-transform"
          style={{
            color: "var(--color-text-muted)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
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
