import { useState } from "react";

interface AbiInputProps {
  value: string;
  onChange: (abi: string) => void;
}

export default function AbiInput({ value, onChange }: AbiInputProps) {
  const [autoFetch, setAutoFetch] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleAutoFetchChange = (checked: boolean) => {
    setAutoFetch(checked);
    if (checked) {
      onChange("__auto_fetch__");
    } else {
      onChange("");
    }
  };

  const isValidJson = (s: string): boolean => {
    if (!s || s === "__auto_fetch__") return true;
    try {
      JSON.parse(s);
      return true;
    } catch {
      return false;
    }
  };

  const valid = isValidJson(value);

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
        style={{
          color: "var(--color-text-primary)",
          backgroundColor: "transparent",
        }}
      >
        <span className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          ABI (optional)
        </span>
        {value && value !== "__auto_fetch__" && (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: valid
                ? "var(--color-success-muted)"
                : "var(--color-danger-muted)",
              color: valid ? "var(--color-success)" : "var(--color-danger)",
            }}
          >
            {valid ? "Valid JSON" : "Invalid JSON"}
          </span>
        )}
        {autoFetch && (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--color-accent-muted)",
              color: "var(--color-accent)",
            }}
          >
            Auto-fetch
          </span>
        )}
      </button>

      {expanded && (
        <div
          className="px-4 pb-4 border-t"
          style={{ borderColor: "var(--color-border-muted)" }}
        >
          <div className="flex items-center gap-3 py-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoFetch}
                onChange={(e) => handleAutoFetchChange(e.target.checked)}
                className="w-4 h-4 rounded accent-purple-500"
              />
              <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                Auto-fetch ABI from contract
              </span>
            </label>
          </div>

          {!autoFetch && (
            <div>
              <label
                className="block text-xs mb-1.5 font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Paste JSON ABI
              </label>
              <textarea
                value={value === "__auto_fetch__" ? "" : value}
                onChange={(e) => onChange(e.target.value)}
                placeholder='[{"type":"function","name":"transfer","inputs":[...]}]'
                rows={6}
                className="w-full px-3 py-2 rounded-md border text-sm resize-y"
                style={{
                  fontFamily: "var(--font-mono)",
                  backgroundColor: "var(--color-bg-input)",
                  borderColor: valid
                    ? "var(--color-border-default)"
                    : "var(--color-danger)",
                  color: "var(--color-text-primary)",
                }}
              />
              {!valid && (
                <p className="text-xs mt-1" style={{ color: "var(--color-danger)" }}>
                  Invalid JSON. Please paste a valid ABI array.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
