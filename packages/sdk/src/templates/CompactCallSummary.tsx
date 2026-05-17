import { type CSSProperties } from "react";
import type { CallType, TraceFrame } from "../types.js";
import { flattenCallTree } from "../traversal/flattenCallTree.js";
import {
  formatGas,
  getFunctionSelector,
  truncateAddress,
} from "../components/formatters.js";

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const CALL_TYPE_COLORS: Record<CallType, string> = {
  CALL: "#8B5CF6",
  STATICCALL: "#38bdf8",
  DELEGATECALL: "#fbbf24",
  CALLCODE: "#fb923c",
  CREATE: "#3fb950",
  CREATE2: "#3fb950",
  SELFDESTRUCT: "#ef4444",
};

const NEUTRAL_TEXT = "#c9d1d9";
const MUTED_TEXT = "#8b949e";
const SUBTLE_TEXT = "#6e7681";
const ERROR_TEXT = "#f85149";

export interface CompactCallSummaryClassNames {
  /** Outer wrapper. */
  root?: string;
  /** Header strip (status badge + total gas). */
  header?: string;
  /** The success/revert status badge. */
  statusBadge?: string;
  /** The total-gas chip. */
  gasTotal?: string;
  /** Container for the list of call lines. */
  list?: string;
  /** One call line. */
  line?: string;
  /** The type chip on a line. */
  typeChip?: string;
  /** The address text on a line. */
  address?: string;
  /** The function selector chip on a line. */
  selector?: string;
  /** The REVERT badge on a line. */
  revertChip?: string;
  /** The "...N more deeper frames" footer. */
  truncationFooter?: string;
}

export interface CompactCallSummaryProps {
  /** Root of the trace. */
  frame: TraceFrame;
  /** Hide frames deeper than this (0-based depth). Default: no limit. */
  maxDepth?: number;
  /** Hide the header strip (status + gas total). */
  hideHeader?: boolean;
  /** Click handler invoked with the clicked frame. */
  onSelect?: (frame: TraceFrame) => void;
  /** Per-slot class names. */
  classNames?: CompactCallSummaryClassNames;
  /** Inline style on the root element. */
  style?: CSSProperties;
  /** className on the root element. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: CSSProperties = {
  padding: "10px 12px",
  background: "rgba(13, 17, 23, 0.4)",
  borderRadius: "8px",
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  fontSize: "12px",
};

const lineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "2px 0",
  whiteSpace: "nowrap",
};

const chipStyle: CSSProperties = {
  padding: "1px 5px",
  borderRadius: "3px",
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.04em",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * One-line-per-call terse summary of a trace, suitable for embedding in
 * logs, alerts, or chat messages where vertical space matters. Each line
 * is indented by 2 spaces per depth level.
 *
 * Use `maxDepth` to cap rendering depth on deep traces. The footer
 * indicates how many frames were elided.
 */
export function CompactCallSummary({
  frame,
  maxDepth,
  hideHeader,
  onSelect,
  classNames,
  style,
  className,
}: CompactCallSummaryProps): React.JSX.Element {
  const flat = flattenCallTree(frame);

  const visible =
    maxDepth === undefined
      ? flat
      : flat.filter((f) => f.depth <= maxDepth);
  const elided = flat.length - visible.length;

  const totalGas = flat.reduce((sum, f) => sum + f.frame.gasUsed, 0n);
  const reverted = !!frame.error || flat.some((f) => !!f.frame.error);

  return (
    <div
      className={[classNames?.root, className].filter(Boolean).join(" ") || undefined}
      style={{ ...containerStyle, ...style }}
    >
      {!hideHeader && (
        <div
          className={classNames?.header}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "6px",
          }}
        >
          <span
            className={classNames?.statusBadge}
            style={{
              ...chipStyle,
              background: reverted ? "rgba(248, 81, 73, 0.18)" : "rgba(63, 185, 80, 0.18)",
              color: reverted ? ERROR_TEXT : "#3fb950",
            }}
          >
            {reverted ? "REVERTED" : "SUCCESS"}
          </span>
          <span
            className={classNames?.gasTotal}
            style={{ color: MUTED_TEXT, fontSize: "11px" }}
          >
            {formatGas(totalGas)} gas · {flat.length} calls
          </span>
        </div>
      )}

      <div className={classNames?.list}>
        {visible.map((f) => (
          <CallLine
            key={f.preOrderIndex}
            flatIndex={f.preOrderIndex}
            depth={f.depth}
            frame={f.frame}
            onSelect={onSelect}
            classNames={classNames}
          />
        ))}
      </div>

      {elided > 0 && (
        <div
          className={classNames?.truncationFooter}
          style={{
            marginTop: "4px",
            color: SUBTLE_TEXT,
            fontSize: "11px",
            fontStyle: "italic",
          }}
        >
          …{elided} deeper {elided === 1 ? "frame" : "frames"} hidden (maxDepth={maxDepth})
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-line renderer
// ---------------------------------------------------------------------------

interface CallLineProps {
  flatIndex: number;
  depth: number;
  frame: TraceFrame;
  onSelect?: (frame: TraceFrame) => void;
  classNames?: CompactCallSummaryClassNames;
}

function CallLine({
  depth,
  frame,
  onSelect,
  classNames,
}: CallLineProps): React.JSX.Element {
  const selectorRaw = getFunctionSelector(frame.input);
  const selector = selectorRaw === "(fallback)" ? null : selectorRaw;
  const target = frame.to === null ? "(create)" : truncateAddress(frame.to);
  const indent = "  ".repeat(depth);

  return (
    <div
      className={classNames?.line}
      style={{ ...lineStyle, cursor: onSelect ? "pointer" : "default" }}
      onClick={onSelect ? () => onSelect(frame) : undefined}
    >
      <span style={{ color: SUBTLE_TEXT, whiteSpace: "pre" }}>{indent}</span>
      <span
        className={classNames?.typeChip}
        style={{ ...chipStyle, color: CALL_TYPE_COLORS[frame.type], background: "rgba(0,0,0,0.2)" }}
      >
        {frame.type}
      </span>
      <span className={classNames?.address} style={{ color: NEUTRAL_TEXT }}>
        {target}
      </span>
      {selector && (
        <span
          className={classNames?.selector}
          style={{ ...chipStyle, color: MUTED_TEXT, background: "rgba(139, 148, 158, 0.15)" }}
        >
          {selector}
        </span>
      )}
      {frame.error && (
        <span
          className={classNames?.revertChip}
          style={{ ...chipStyle, color: ERROR_TEXT, background: "rgba(248, 81, 73, 0.18)" }}
        >
          REVERT
        </span>
      )}
    </div>
  );
}
