import { useState } from "react";
import { Icon } from "@iconify/react";
import type { AbiItem } from "./types";

export function WriteFunction({ fn }: { fn: AbiItem }) {
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
            Write functions require a connected wallet to execute. Use the
            Simulator tab to test this function.
          </div>
        </div>
      )}
    </div>
  );
}
