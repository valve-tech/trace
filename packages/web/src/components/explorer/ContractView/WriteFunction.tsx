import { useState } from "react";
import { Icon } from "@iconify/react";
import type { AbiItem } from "./types";

export function WriteFunction({ fn }: { fn: AbiItem }) {
  const [expanded, setExpanded] = useState(false);
  const inputs = fn.inputs || [];

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
            className="text-sm font-medium theme-warning"
          >
            {fn.name}
          </span>
          <span
            className="text-[10px] theme-text-muted"
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
                    placeholder={inp.type}
                    disabled
                    className="w-full px-2.5 py-1.5 rounded bs text-xs"
                    style={{
                      fontFamily: "var(--font-mono)",
                      backgroundColor: "var(--color-bg-input)",
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
            Write functions require a connected wallet to execute. Use the
            Simulator tab to test this function.
          </div>
        </div>
      )}
    </div>
  );
}
