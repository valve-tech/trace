import { useState } from "react";
import { Icon } from "@iconify/react";
import { Checkbox } from "./primitives/Checkbox";

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
      className="rounded-lg bs overflow-hidden theme-card-bg"
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium theme-text"
        style={{ backgroundColor: "transparent" }}
      >
        <span className="flex items-center gap-inline">
          <Icon
            icon="heroicons:chevron-right"
            className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
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
            className="text-xs px-2 py-0.5 rounded-full theme-accent-bg theme-accent"
          >
            Auto-fetch
          </span>
        )}
      </button>

      {expanded && (
        <div
          className="px-4 pb-4 bs-t-muted"
          style={{}}
        >
          <div className="flex items-center gap-row py-3">
            <Checkbox
              checked={autoFetch}
              onChange={handleAutoFetchChange}
              label="Auto-fetch ABI from contract"
            />
          </div>

          {!autoFetch && (
            <div>
              <label
                className="block text-xs mb-1.5 font-medium theme-text-secondary"
              >
                Paste JSON ABI
              </label>
              <textarea
                value={value === "__auto_fetch__" ? "" : value}
                onChange={(e) => onChange(e.target.value)}
                placeholder='[{"type":"function","name":"transfer","inputs":[...]}]'
                rows={6}
                className="w-full px-3 py-2 rounded-md text-sm resize-y theme-mono theme-input-bg theme-text"
                style={{
                  borderColor: valid
                    ? "var(--color-border-default)"
                    : "var(--color-danger)",
                }}
              />
              {!valid && (
                <p className="text-xs mt-1 theme-danger">
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
