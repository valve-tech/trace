import { useState, type CSSProperties } from "react";
import type { CallType, TraceFrame } from "../types.js";
import {
  formatGas,
  formatWei,
  getFunctionSelector,
  truncateAddress,
} from "./formatters.js";

// ---------------------------------------------------------------------------
// Theme — default colors. Override per-slot via the `classNames` prop, or
// wrap the component and use CSS cascade.
// ---------------------------------------------------------------------------

interface CallTypeStyle {
  bg: string;
  text: string;
}

const DEFAULT_CALL_TYPE_COLORS: Record<CallType, CallTypeStyle> = {
  CALL: { bg: "rgba(139, 92, 246, 0.15)", text: "#8B5CF6" },
  STATICCALL: { bg: "rgba(56, 189, 248, 0.15)", text: "#38bdf8" },
  DELEGATECALL: { bg: "rgba(251, 191, 36, 0.15)", text: "#fbbf24" },
  CALLCODE: { bg: "rgba(251, 146, 60, 0.15)", text: "#fb923c" },
  CREATE: { bg: "rgba(63, 185, 80, 0.15)", text: "#3fb950" },
  CREATE2: { bg: "rgba(63, 185, 80, 0.15)", text: "#3fb950" },
  SELFDESTRUCT: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444" },
};

const UNKNOWN_TYPE_STYLE: CallTypeStyle = {
  bg: "rgba(139, 148, 158, 0.15)",
  text: "#8b949e",
};

export interface CallTreeClassNames {
  /** Outer wrapper card. */
  root?: string;
  /** Header row (title + counts). */
  header?: string;
  /** Legend row of call-type chips. */
  legend?: string;
  /** Container for the tree of nodes. */
  tree?: string;
  /** The clickable row for an individual frame. */
  nodeRow?: string;
  /** The call-type badge (CALL/STATICCALL/etc). */
  typeBadge?: string;
  /** The address text (from / to). */
  address?: string;
  /** The function selector chip. */
  selector?: string;
  /** The non-zero value chip. */
  value?: string;
  /** The "REVERT" badge. */
  errorBadge?: string;
  /** The expanded detail panel under a frame. */
  detailPanel?: string;
}

export interface CallTreeProps {
  /** Root frame of the trace. Renders the entire tree underneath. */
  frame: TraceFrame;
  /** Optional click handler — invoked with the clicked frame. */
  onSelect?: (frame: TraceFrame) => void;
  /** How many levels are expanded initially. Default: 2. */
  defaultExpandedDepth?: number;
  /** Symbol shown alongside non-zero values. Default: "PLS". */
  valueSymbol?: string;
  /** Hide the header (title + counts). */
  hideHeader?: boolean;
  /** Hide the legend chips. */
  hideLegend?: boolean;
  /** Per-slot class names for theming. */
  classNames?: CallTreeClassNames;
  /** Inline style on the root element. */
  style?: CSSProperties;
  /** className on the root element (in addition to classNames.root). */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCallTypeStyle(type: CallType): CallTypeStyle {
  return DEFAULT_CALL_TYPE_COLORS[type] ?? UNKNOWN_TYPE_STYLE;
}

function countFrames(frame: TraceFrame): number {
  let count = 0;
  // Iterative count to avoid recursion on pathologically deep trees.
  const stack: TraceFrame[] = [frame];
  while (stack.length > 0) {
    const f = stack.pop()!;
    count++;
    for (const c of f.children) stack.push(c);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Internal node renderer (recursive React — bounded by React's reconciler,
// not by JS call stack)
// ---------------------------------------------------------------------------

interface CallNodeProps {
  frame: TraceFrame;
  depth: number;
  defaultExpanded: boolean;
  defaultExpandedDepth: number;
  onSelect?: (frame: TraceFrame) => void;
  valueSymbol: string;
  classNames: CallTreeClassNames;
}

function CallNode({
  frame,
  depth,
  defaultExpanded,
  defaultExpandedDepth,
  onSelect,
  valueSymbol,
  classNames,
}: CallNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showDetails, setShowDetails] = useState(false);

  const hasChildren = frame.children.length > 0;
  const typeStyle = getCallTypeStyle(frame.type);
  const valueDisplay = formatWei(frame.value, valueSymbol);
  const selector = frame.functionName ?? getFunctionSelector(frame.input);

  return (
    <div
      style={{
        marginLeft: depth > 0 ? 20 : 0,
        borderLeft: depth > 0 ? "2px solid rgba(139, 148, 158, 0.2)" : "none",
        paddingLeft: depth > 0 ? 12 : 0,
      }}
    >
      <div
        className={classNames.nodeRow}
        onClick={onSelect ? () => onSelect(frame) : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 8,
          marginBottom: 4,
          backgroundColor: "rgba(139, 148, 158, 0.08)",
          cursor: onSelect ? "pointer" : "default",
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            style={{
              flexShrink: 0,
              width: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              border: "none",
              backgroundColor: "rgba(139, 148, 158, 0.15)",
              color: "#8b949e",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                display: "inline-block",
                transition: "transform 0.15s",
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
            >
              ▶
            </span>
          </button>
        ) : (
          <span
            style={{
              flexShrink: 0,
              width: 20,
              height: 20,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "rgba(139, 148, 158, 0.4)",
                display: "inline-block",
              }}
            />
          </span>
        )}

        <span
          className={classNames.typeBadge}
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 4,
            flexShrink: 0,
            backgroundColor: typeStyle.bg,
            color: typeStyle.text,
          }}
        >
          {frame.type}
        </span>

        <span
          className={classNames.address}
          style={{ fontSize: 11, fontFamily: "monospace", color: "#8b949e" }}
        >
          {truncateAddress(frame.from)}
        </span>
        <span style={{ color: "#6e7681", flexShrink: 0 }}>→</span>
        <span
          className={classNames.address}
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            fontWeight: 500,
            color: frame.to ? "#58a6ff" : "#3fb950",
          }}
        >
          {frame.to === null ? "(contract creation)" : truncateAddress(frame.to)}
        </span>

        <span
          className={classNames.selector}
          style={{ fontSize: 11, fontFamily: "monospace", color: "#c9d1d9" }}
        >
          {selector}
        </span>

        {valueDisplay && (
          <span
            className={classNames.value}
            style={{
              fontSize: 11,
              fontFamily: "monospace",
              padding: "2px 6px",
              borderRadius: 4,
              backgroundColor: "rgba(63, 185, 80, 0.15)",
              color: "#3fb950",
            }}
          >
            {valueDisplay}
          </span>
        )}

        <span
          style={{
            fontSize: 11,
            marginLeft: "auto",
            flexShrink: 0,
            color: "#6e7681",
          }}
        >
          {formatGas(frame.gasUsed)} gas
        </span>

        {(frame.error || frame.revertReason) && (
          <span
            className={classNames.errorBadge}
            style={{
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 4,
              fontWeight: 500,
              flexShrink: 0,
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "#ef4444",
            }}
            title={frame.revertReason || frame.error}
          >
            REVERT
          </span>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowDetails(!showDetails);
          }}
          style={{
            flexShrink: 0,
            width: 20,
            height: 20,
            border: "none",
            borderRadius: 4,
            backgroundColor: "rgba(139, 148, 158, 0.15)",
            color: "#8b949e",
            cursor: "pointer",
            fontSize: 10,
          }}
          title="Show details"
        >
          ⋯
        </button>
      </div>

      {showDetails && (
        <div
          className={classNames.detailPanel}
          style={{
            margin: "0 0 8px 28px",
            padding: 12,
            borderRadius: 8,
            fontSize: 11,
            backgroundColor: "rgba(139, 148, 158, 0.05)",
            border: "1px solid rgba(139, 148, 158, 0.2)",
            color: "#c9d1d9",
          }}
        >
          <DetailRow label="Type" value={frame.type} />
          <DetailRow label="From" value={frame.from} mono />
          <DetailRow label="To" value={frame.to ?? "(contract creation)"} mono />
          <DetailRow label="Gas" value={formatGas(frame.gas)} />
          <DetailRow label="Gas Used" value={formatGas(frame.gasUsed)} />
          {frame.value > 0n && (
            <DetailRow label="Value" value={frame.value.toString()} mono />
          )}
          {frame.input && frame.input !== "0x" && (
            <DataBlock label="Input" value={frame.input} />
          )}
          {frame.output && frame.output !== "0x" && (
            <DataBlock label="Output" value={frame.output} />
          )}
          {frame.revertReason && (
            <DetailRow label="Revert" value={frame.revertReason} danger />
          )}
          {frame.error && !frame.revertReason && (
            <DetailRow label="Error" value={frame.error} danger />
          )}
        </div>
      )}

      {expanded && hasChildren && (
        <div>
          {frame.children.map((child, i) => (
            <CallNode
              key={`${child.to ?? "create"}-${i}`}
              frame={child}
              depth={depth + 1}
              defaultExpanded={depth + 1 < defaultExpandedDepth}
              defaultExpandedDepth={defaultExpandedDepth}
              onSelect={onSelect}
              valueSymbol={valueSymbol}
              classNames={classNames}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
    <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
      <span
        style={{
          fontWeight: 500,
          flexShrink: 0,
          width: 80,
          color: "#8b949e",
        }}
      >
        {label}:
      </span>
      <span
        style={{
          wordBreak: "break-all",
          fontFamily: mono ? "monospace" : "inherit",
          color: danger ? "#ef4444" : "inherit",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function DataBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontWeight: 500, marginBottom: 4, color: "#8b949e" }}>
        {label}:
      </div>
      <div
        style={{
          padding: 8,
          borderRadius: 4,
          wordBreak: "break-all",
          fontFamily: "monospace",
          maxHeight: 128,
          overflowY: "auto",
          fontSize: 10,
          backgroundColor: "rgba(0, 0, 0, 0.2)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/**
 * Headless call-tree renderer. Pass a normalized `TraceFrame` (from any SDK
 * loader); the component handles expand/collapse, click selection, and
 * inline detail panels.
 *
 * Theming: default colors are built in. Override via `classNames` for
 * slot-level targeting, or wrap the component and use CSS cascade.
 *
 * Self-contained: no external CSS framework required. Works inside a Tailwind
 * app, a vanilla app, or anywhere React runs.
 */
export function CallTree({
  frame,
  onSelect,
  defaultExpandedDepth = 2,
  valueSymbol = "PLS",
  hideHeader = false,
  hideLegend = false,
  classNames = {},
  style,
  className,
}: CallTreeProps): React.JSX.Element {
  const totalCalls = countFrames(frame);

  return (
    <div
      className={[className, classNames.root].filter(Boolean).join(" ")}
      style={{
        padding: 16,
        borderRadius: 8,
        border: "1px solid rgba(139, 148, 158, 0.2)",
        backgroundColor: "rgba(139, 148, 158, 0.03)",
        ...style,
      }}
    >
      {!hideHeader && (
        <div
          className={classNames.header}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              margin: 0,
              color: "#c9d1d9",
            }}
          >
            Execution Call Tree
          </h3>
          <div
            style={{ display: "flex", gap: 12, fontSize: 11, color: "#8b949e" }}
          >
            <span>
              {totalCalls} call{totalCalls !== 1 ? "s" : ""}
            </span>
            <span>{formatGas(frame.gasUsed)} total gas</span>
          </div>
        </div>
      )}

      {!hideLegend && (
        <div
          className={classNames.legend}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {(Object.keys(DEFAULT_CALL_TYPE_COLORS) as CallType[]).map((type) => {
            const s = DEFAULT_CALL_TYPE_COLORS[type];
            return (
              <span
                key={type}
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  padding: "2px 8px",
                  borderRadius: 4,
                  backgroundColor: s.bg,
                  color: s.text,
                }}
              >
                {type}
              </span>
            );
          })}
        </div>
      )}

      <div
        className={classNames.tree}
        style={{ overflowX: "auto" }}
      >
        <CallNode
          frame={frame}
          depth={0}
          defaultExpanded={defaultExpandedDepth > 0}
          defaultExpandedDepth={defaultExpandedDepth}
          onSelect={onSelect}
          valueSymbol={valueSymbol}
          classNames={classNames}
        />
      </div>
    </div>
  );
}
