import { Fragment, useCallback, useMemo, useState, type CSSProperties } from "react";
import type { OpcodeStep } from "../types.js";
import { getOpcodeColor, isExpensiveOp } from "./opcodeClassify.js";

export interface OpcodeViewerClassNames {
  root?: string;
  header?: string;
  legend?: string;
  table?: string;
  row?: string;
  detail?: string;
  loadMore?: string;
  filterInput?: string;
}

export interface OpcodeViewerProps {
  /** The opcode trace, typically from `TraceResult.opcodes`. */
  steps: OpcodeStep[];
  /** Optional click handler — fires with the step index and step. */
  onSelectStep?: (index: number, step: OpcodeStep) => void;
  /** Page size for incremental "Load more". Default 500. */
  rowsPerPage?: number;
  /** Hide the header (title + step count + filter input). */
  hideHeader?: boolean;
  /** Hide the legend strip. */
  hideLegend?: boolean;
  /** Per-slot class names for theming. */
  classNames?: OpcodeViewerClassNames;
  /** Inline style on the root element. */
  style?: CSSProperties;
  /** className on the root. */
  className?: string;
}

const DEFAULT_ROWS_PER_PAGE = 500;

/**
 * Tabular opcode-trace viewer with filter, expandable per-row stack/memory/
 * storage detail, and incremental pagination for large traces.
 *
 * The component is fully controlled by its `steps` prop — no fetching, no
 * external state. Headless theming via `classNames` + `style` + `className`.
 */
export function OpcodeViewer({
  steps,
  onSelectStep,
  rowsPerPage = DEFAULT_ROWS_PER_PAGE,
  hideHeader = false,
  hideLegend = false,
  classNames = {},
  style,
  className,
}: OpcodeViewerProps): React.JSX.Element {
  const [displayCount, setDisplayCount] = useState(rowsPerPage);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [filterOp, setFilterOp] = useState("");

  // Indexed steps (each carrying its original index) so a filtered view can
  // still report the global step number on expand.
  const indexedSteps = useMemo(
    () => steps.map((step, index) => ({ step, index })),
    [steps],
  );

  const filteredSteps = useMemo(() => {
    if (!filterOp) return indexedSteps;
    const needle = filterOp.toLowerCase();
    return indexedSteps.filter((e) => e.step.op.toLowerCase().includes(needle));
  }, [indexedSteps, filterOp]);

  const visibleSteps = filteredSteps.slice(0, displayCount);
  const hasMore = displayCount < filteredSteps.length;

  const handleFilterChange = useCallback(
    (value: string) => {
      setFilterOp(value);
      setDisplayCount(rowsPerPage);
    },
    [rowsPerPage],
  );

  const handleRowClick = useCallback(
    (globalIndex: number, step: OpcodeStep) => {
      setExpandedRow((prev) => (prev === globalIndex ? null : globalIndex));
      onSelectStep?.(globalIndex, step);
    },
    [onSelectStep],
  );

  return (
    <div
      className={[className, classNames.root].filter(Boolean).join(" ")}
      style={{
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
            padding: 16,
            borderBottom: "1px solid rgba(139, 148, 158, 0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h3
              style={{
                fontSize: 13,
                fontWeight: 600,
                margin: 0,
                color: "#c9d1d9",
              }}
            >
              Opcode Trace
            </h3>
            <span style={{ fontSize: 11, color: "#8b949e" }}>
              {filteredSteps.length.toLocaleString()} steps
              {filterOp &&
                ` (filtered from ${steps.length.toLocaleString()})`}
            </span>
          </div>
          <input
            type="text"
            placeholder="Filter opcodes..."
            value={filterOp}
            onChange={(e) => handleFilterChange(e.target.value)}
            className={classNames.filterInput}
            aria-label="Filter opcodes"
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid rgba(139, 148, 158, 0.3)",
              backgroundColor: "rgba(0, 0, 0, 0.2)",
              color: "#c9d1d9",
              fontFamily: "monospace",
              fontSize: 11,
              width: 160,
            }}
          />
        </div>
      )}

      {!hideLegend && <OpcodeLegend className={classNames.legend} />}

      <div
        className={classNames.table}
        style={{
          overflowX: "auto",
          maxHeight: 600,
          overflowY: "auto",
        }}
      >
        <table
          style={{
            width: "100%",
            fontSize: 11,
            borderCollapse: "collapse",
          }}
        >
          <thead
            style={{
              position: "sticky",
              top: 0,
              backgroundColor: "rgba(0, 0, 0, 0.2)",
            }}
          >
            <tr style={{ borderBottom: "1px solid rgba(139, 148, 158, 0.2)" }}>
              <Th width={64} align="left">Step</Th>
              <Th width={64} align="left">PC</Th>
              <Th width={128} align="left">Opcode</Th>
              <Th width={96} align="right">Gas</Th>
              <Th width={96} align="right">Gas Cost</Th>
              <Th width={64} align="right">Depth</Th>
            </tr>
          </thead>
          <tbody>
            {visibleSteps.map(({ step, index }) => {
              const isExpanded = expandedRow === index;
              const expensive = isExpensiveOp(step.op);
              return (
                <Fragment key={index}>
                  <tr
                    className={classNames.row}
                    onClick={() => handleRowClick(index, step)}
                    style={{
                      borderBottom: "1px solid rgba(139, 148, 158, 0.1)",
                      cursor: "pointer",
                      backgroundColor: isExpanded
                        ? "rgba(99, 102, 241, 0.08)"
                        : expensive
                          ? "rgba(248, 81, 73, 0.04)"
                          : "transparent",
                    }}
                  >
                    <Td color="#6e7681">{index}</Td>
                    <Td color="#8b949e">{step.pc}</Td>
                    <td style={{ padding: "6px 12px", fontFamily: "monospace", fontWeight: 600 }}>
                      <span style={{ color: getOpcodeColor(step.op) }}>
                        {step.op}
                      </span>
                      {expensive && (
                        <span
                          title="Expensive operation"
                          style={{
                            display: "inline-block",
                            marginLeft: 6,
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            backgroundColor: "#ef4444",
                          }}
                        />
                      )}
                    </td>
                    <Td align="right" color="#8b949e">
                      {step.gas.toLocaleString()}
                    </Td>
                    <Td
                      align="right"
                      color={expensive ? "#eab308" : "#c9d1d9"}
                    >
                      {step.gasCost.toLocaleString()}
                    </Td>
                    <Td align="right" color="#6e7681">
                      {step.depth}
                    </Td>
                  </tr>
                  {isExpanded && (
                    <ExpandedDetail
                      step={step}
                      className={classNames.detail}
                    />
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div
          style={{
            padding: 16,
            borderTop: "1px solid rgba(139, 148, 158, 0.2)",
            textAlign: "center",
          }}
        >
          <button
            type="button"
            onClick={() => setDisplayCount((p) => p + rowsPerPage)}
            className={classNames.loadMore}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
              backgroundColor: "rgba(99, 102, 241, 0.15)",
              color: "#6366f1",
            }}
          >
            Load{" "}
            {Math.min(
              rowsPerPage,
              filteredSteps.length - displayCount,
            ).toLocaleString()}{" "}
            more steps (
            {(filteredSteps.length - displayCount).toLocaleString()} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function Th({
  children,
  width,
  align,
}: {
  children: React.ReactNode;
  width: number;
  align: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "8px 12px",
        fontWeight: 500,
        width,
        color: "#8b949e",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  color,
  align = "left",
}: {
  children: React.ReactNode;
  color: string;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        padding: "6px 12px",
        fontFamily: "monospace",
        textAlign: align,
        color,
      }}
    >
      {children}
    </td>
  );
}

function OpcodeLegend({ className }: { className?: string }) {
  const items: Array<{ label: string; color: string }> = [
    { label: "Stack", color: "#6366f1" },
    { label: "Memory", color: "#22c55e" },
    { label: "Storage", color: "#f97316" },
    { label: "Calls", color: "#ef4444" },
    { label: "Logging", color: "#eab308" },
    { label: "Hash", color: "#06b6d4" },
    { label: "Control", color: "#64748b" },
  ];
  return (
    <div
      className={className}
      style={{
        padding: "8px 16px",
        borderBottom: "1px solid rgba(139, 148, 158, 0.1)",
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      {items.map(({ label, color }) => (
        <div
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: color,
            }}
          />
          <span style={{ color: "#8b949e" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function ExpandedDetail({
  step,
  className,
}: {
  step: OpcodeStep;
  className?: string;
}) {
  const hasStack = step.stack.length > 0;
  const hasMemory = step.memory.length > 0;
  const hasStorage = Object.keys(step.storage).length > 0;

  if (!hasStack && !hasMemory && !hasStorage) {
    return (
      <tr>
        <td
          colSpan={6}
          className={className}
          style={{
            padding: "8px 12px",
            fontSize: 11,
            backgroundColor: "rgba(0, 0, 0, 0.2)",
            color: "#6e7681",
          }}
        >
          No stack, memory, or storage data for this step.
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td
        colSpan={6}
        className={className}
        style={{
          padding: 12,
          backgroundColor: "rgba(0, 0, 0, 0.2)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 11 }}>
          {hasStack && <StackPanel step={step} />}
          {hasMemory && <MemoryPanel step={step} />}
          {hasStorage && <StoragePanel step={step} />}
        </div>
      </td>
    </tr>
  );
}

function StackPanel({ step }: { step: OpcodeStep }) {
  // Reverse for display so the top of the stack is at index 0 visually.
  return (
    <div>
      <span
        style={{ fontWeight: 500, display: "block", marginBottom: 4, color: "#8b949e" }}
      >
        Stack ({step.stack.length} items):
      </span>
      <div
        style={{
          padding: 8,
          borderRadius: 4,
          fontFamily: "monospace",
          maxHeight: 128,
          overflowY: "auto",
          backgroundColor: "rgba(139, 148, 158, 0.08)",
          fontSize: 10,
        }}
      >
        {step.stack
          .slice()
          .reverse()
          .map((val, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  width: 24,
                  flexShrink: 0,
                  textAlign: "right",
                  color: "#6e7681",
                }}
              >
                {step.stack.length - 1 - i}
              </span>
              <span style={{ wordBreak: "break-all", color: "#c9d1d9" }}>
                {val}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function MemoryPanel({ step }: { step: OpcodeStep }) {
  return (
    <div>
      <span
        style={{ fontWeight: 500, display: "block", marginBottom: 4, color: "#8b949e" }}
      >
        Memory ({step.memory.length} words):
      </span>
      <div
        style={{
          padding: 8,
          borderRadius: 4,
          fontFamily: "monospace",
          maxHeight: 96,
          overflowY: "auto",
          color: "#c9d1d9",
          backgroundColor: "rgba(139, 148, 158, 0.08)",
          fontSize: 10,
        }}
      >
        {step.memory.slice(0, 16).map((word, i) => (
          <div key={i} style={{ display: "flex", gap: 8 }}>
            <span
              style={{
                width: 40,
                flexShrink: 0,
                textAlign: "right",
                color: "#6e7681",
              }}
            >
              0x{(i * 32).toString(16).padStart(4, "0")}
            </span>
            <span style={{ wordBreak: "break-all" }}>{word}</span>
          </div>
        ))}
        {step.memory.length > 16 && (
          <div style={{ color: "#6e7681" }}>
            ... {step.memory.length - 16} more words
          </div>
        )}
      </div>
    </div>
  );
}

function StoragePanel({ step }: { step: OpcodeStep }) {
  return (
    <div>
      <span
        style={{ fontWeight: 500, display: "block", marginBottom: 4, color: "#8b949e" }}
      >
        Storage changes:
      </span>
      <div
        style={{
          padding: 8,
          borderRadius: 4,
          fontFamily: "monospace",
          maxHeight: 96,
          overflowY: "auto",
          backgroundColor: "rgba(139, 148, 158, 0.08)",
          fontSize: 10,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {Object.entries(step.storage).map(([slot, value]) => (
          <div key={slot} style={{ display: "flex", gap: 8 }}>
            <span style={{ color: "#eab308" }}>{slot}</span>
            <span style={{ color: "#6e7681" }}>=&gt;</span>
            <span style={{ wordBreak: "break-all", color: "#c9d1d9" }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Re-export the pure helpers for direct use.
export {
  classifyOpcode,
  getOpcodeColor,
  isExpensiveOp,
  OPCODE_CATEGORY_COLORS,
  type OpcodeCategory,
} from "./opcodeClassify.js";
