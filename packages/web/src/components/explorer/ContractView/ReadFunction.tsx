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
      className="rounded-md bs-muted theme-secondary-bg"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-inline">
          <span
            className="text-sm font-medium theme-accent"
          >
            {fn.name}
          </span>
          <span
            className="text-[10px] theme-text-muted"
          >
            ({inputs.map((i) => i.type).join(", ")})
            {outputs.length > 0 &&
              ` -> (${outputs.map((o) => o.type).join(", ")})`}
          </span>
        </div>
        <Icon
          icon="heroicons:chevron-down"
          className="w-3.5 h-3.5 transition-transform theme-text-muted"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {expanded && (
        <div
          className="px-3 pb-3 bs-t-muted pt-3"
          style={{}}
        >
          {inputs.length > 0 && (
            <div className="space-y-2 mb-3">
              {inputs.map((inp, i) => (
                <div key={i}>
                  <label
                    className="text-xs font-medium block mb-1 theme-text-secondary"
                  >
                    {inp.name}{" "}
                    <span className="theme-text-muted">
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
                    className="w-full px-2.5 py-1.5 rounded bs text-xs theme-mono theme-input-bg theme-text"
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
              className="mt-2 rounded-md p-2.5 text-xs font-mono break-all theme-primary-bg theme-success"
            >
              {result}
            </div>
          )}

          {error && (
            <div
              className="mt-2 rounded-md p-2.5 text-xs font-mono theme-danger-bg theme-danger"
            >
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
