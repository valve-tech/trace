import { useState } from "react";
import type { CallFrame } from "../../api/debugger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CALL_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  CALL: {
    bg: "rgba(139, 92, 246, 0.15)",
    text: "#8B5CF6",
  },
  STATICCALL: {
    bg: "rgba(56, 189, 248, 0.15)",
    text: "#38bdf8",
  },
  DELEGATECALL: {
    bg: "rgba(251, 191, 36, 0.15)",
    text: "#fbbf24",
  },
  CALLCODE: {
    bg: "rgba(251, 146, 60, 0.15)",
    text: "#fb923c",
  },
  CREATE: {
    bg: "rgba(63, 185, 80, 0.15)",
    text: "#3fb950",
  },
  CREATE2: {
    bg: "rgba(63, 185, 80, 0.15)",
    text: "#3fb950",
  },
};

function getCallTypeStyle(type: string): { bg: string; text: string } {
  return (
    CALL_TYPE_COLORS[type] ?? {
      bg: "rgba(139, 148, 158, 0.15)",
      text: "#8b949e",
    }
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatGas(gasStr: string | number | undefined): string {
  if (gasStr === undefined) return "-";
  const val =
    typeof gasStr === "number"
      ? gasStr
      : parseInt(gasStr, gasStr.startsWith("0x") ? 16 : 10);
  if (isNaN(val)) return String(gasStr);
  return val.toLocaleString();
}

function formatValue(hexValue: string | undefined): string | null {
  if (!hexValue || hexValue === "0x0" || hexValue === "0x") return null;
  const wei = BigInt(hexValue);
  if (wei === 0n) return null;
  // Display in PLS (18 decimals)
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  if (frac === 0n) return `${whole} PLS`;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fracStr} PLS`;
}

function getFunctionName(input: string): string {
  if (!input || input === "0x") return "(fallback)";
  if (input.length < 10) return "(fallback)";
  return input.slice(0, 10);
}

// ---------------------------------------------------------------------------
// CallNode component
// ---------------------------------------------------------------------------

interface CallNodeProps {
  frame: CallFrame;
  depth: number;
  defaultExpanded?: boolean;
}

function CallNode({ frame, depth, defaultExpanded = true }: CallNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showDetails, setShowDetails] = useState(false);

  const hasChildren = frame.calls && frame.calls.length > 0;
  const typeStyle = getCallTypeStyle(frame.type);
  const valuePLS = formatValue(frame.value);
  const selector = getFunctionName(frame.input);

  return (
    <div
      style={{
        marginLeft: depth > 0 ? 20 : 0,
        borderLeft: depth > 0 ? "2px solid var(--color-border-muted)" : "none",
        paddingLeft: depth > 0 ? 12 : 0,
      }}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-lg mb-1 group"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          cursor: hasChildren || frame.input?.length > 2 ? "pointer" : "default",
        }}
      >
        {/* Expand/collapse button */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-secondary)",
            }}
          >
            <svg
              className="w-3 h-3 transition-transform"
              style={{
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : (
          <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "var(--color-border-default)" }}
            />
          </span>
        )}

        {/* Call type badge */}
        <span
          className="text-xs font-mono font-semibold px-2 py-0.5 rounded flex-shrink-0"
          style={{
            backgroundColor: typeStyle.bg,
            color: typeStyle.text,
          }}
        >
          {frame.type}
        </span>

        {/* Addresses: from -> to */}
        <span
          className="text-xs font-mono"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {truncateAddress(frame.from)}
        </span>
        <svg
          className="w-3 h-3 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          style={{ color: "var(--color-text-muted)" }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
        <span
          className="text-xs font-mono font-medium"
          style={{ color: "var(--color-accent)" }}
        >
          {truncateAddress(frame.to)}
        </span>

        {/* Function selector */}
        <span
          className="text-xs font-mono"
          style={{ color: "var(--color-text-primary)" }}
        >
          {selector}
        </span>

        {/* Value if non-zero */}
        {valuePLS && (
          <span
            className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: "var(--color-success-muted)",
              color: "var(--color-success)",
            }}
          >
            {valuePLS}
          </span>
        )}

        {/* Gas used */}
        <span
          className="text-xs ml-auto flex-shrink-0"
          style={{ color: "var(--color-text-muted)" }}
        >
          {formatGas(frame.gasUsed)} gas
        </span>

        {/* Error indicator */}
        {frame.error && (
          <span
            className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
            style={{
              backgroundColor: "var(--color-danger-muted)",
              color: "var(--color-danger)",
            }}
          >
            REVERT
          </span>
        )}

        {/* Detail toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDetails(!showDetails);
          }}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            color: "var(--color-text-secondary)",
          }}
          title="Show details"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
        </button>
      </div>

      {/* Detail panel */}
      {showDetails && (
        <div
          className="mb-2 ml-7 p-3 rounded-lg text-xs space-y-2"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            border: "1px solid var(--color-border-muted)",
          }}
        >
          <DetailRow label="Type" value={frame.type} />
          <DetailRow label="From" value={frame.from} mono />
          <DetailRow label="To" value={frame.to} mono />
          <DetailRow label="Gas" value={formatGas(frame.gas)} />
          <DetailRow label="Gas Used" value={formatGas(frame.gasUsed)} />
          {frame.value && frame.value !== "0x0" && (
            <DetailRow label="Value" value={frame.value} mono />
          )}
          {frame.input && frame.input !== "0x" && (
            <div>
              <span
                className="font-medium block mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Input Data:
              </span>
              <div
                className="p-2 rounded break-all font-mono max-h-32 overflow-y-auto"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  color: "var(--color-text-primary)",
                  fontSize: "0.65rem",
                }}
              >
                {frame.input}
              </div>
            </div>
          )}
          {frame.output && frame.output !== "0x" && (
            <div>
              <span
                className="font-medium block mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Output Data:
              </span>
              <div
                className="p-2 rounded break-all font-mono max-h-32 overflow-y-auto"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  color: "var(--color-text-primary)",
                  fontSize: "0.65rem",
                }}
              >
                {frame.output}
              </div>
            </div>
          )}
          {frame.error && (
            <DetailRow label="Error" value={frame.error} danger />
          )}
        </div>
      )}

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {frame.calls!.map((child, i) => (
            <CallNode
              key={`${child.to}-${i}`}
              frame={child}
              depth={depth + 1}
              defaultExpanded={depth < 2}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DetailRow helper
// ---------------------------------------------------------------------------

function DetailRow({
  label,
  value,
  mono = false,
  danger = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span
        className="font-medium flex-shrink-0 w-20"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}:
      </span>
      <span
        className={`break-all ${mono ? "font-mono" : ""}`}
        style={{
          color: danger ? "var(--color-danger)" : "var(--color-text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CallTreeProps {
  trace: CallFrame;
}

export default function CallTree({ trace }: CallTreeProps) {
  const totalCalls = countCalls(trace);

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Execution Call Tree
        </h3>
        <div className="flex items-center gap-3">
          <span
            className="text-xs"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {totalCalls} call{totalCalls !== 1 ? "s" : ""}
          </span>
          <span
            className="text-xs"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {formatGas(trace.gasUsed)} total gas
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(CALL_TYPE_COLORS).map(([type, style]) => (
          <span
            key={type}
            className="text-xs font-mono px-2 py-0.5 rounded"
            style={{ backgroundColor: style.bg, color: style.text }}
          >
            {type}
          </span>
        ))}
      </div>

      {/* Tree */}
      <div className="overflow-x-auto">
        <CallNode frame={trace} depth={0} defaultExpanded />
      </div>
    </div>
  );
}

function countCalls(frame: CallFrame): number {
  let count = 1;
  if (frame.calls) {
    for (const child of frame.calls) {
      count += countCalls(child);
    }
  }
  return count;
}
