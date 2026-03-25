import { useState, useCallback } from "react";
import type { OpcodeStep } from "../../api/debugger";

// ---------------------------------------------------------------------------
// Opcode color coding by category
// ---------------------------------------------------------------------------

function getOpcodeColor(op: string): string {
  // Storage — orange
  if (["SLOAD", "SSTORE"].includes(op)) return "#f97316";
  // Memory — green
  if (["MLOAD", "MSTORE", "MSTORE8", "MSIZE", "MCOPY"].includes(op))
    return "#22c55e";
  // External calls — red
  if (
    [
      "CALL",
      "STATICCALL",
      "DELEGATECALL",
      "CALLCODE",
      "CREATE",
      "CREATE2",
      "SELFDESTRUCT",
    ].includes(op)
  )
    return "#ef4444";
  // Stack ops — blue
  if (
    op.startsWith("PUSH") ||
    op.startsWith("DUP") ||
    op.startsWith("SWAP") ||
    op === "POP"
  )
    return "#6366f1";
  // Logging — yellow
  if (op.startsWith("LOG")) return "#eab308";
  // Hashing
  if (["SHA3", "KECCAK256"].includes(op)) return "#06b6d4";
  // Control flow
  if (
    ["JUMP", "JUMPI", "JUMPDEST", "STOP", "RETURN", "REVERT", "INVALID"].includes(
      op,
    )
  )
    return "#64748b";

  return "var(--color-text-primary)";
}

function isExpensiveOp(op: string): boolean {
  return [
    "SSTORE",
    "SLOAD",
    "CREATE",
    "CREATE2",
    "CALL",
    "STATICCALL",
    "DELEGATECALL",
    "CALLCODE",
    "SELFDESTRUCT",
    "LOG0",
    "LOG1",
    "LOG2",
    "LOG3",
    "LOG4",
  ].includes(op);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROWS_PER_PAGE = 500;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ExpandedDetail({ step }: { step: OpcodeStep }) {
  const hasStack = step.stack && step.stack.length > 0;
  const hasMemory = step.memory && step.memory.length > 0;
  const hasStorage =
    step.storage && Object.keys(step.storage).length > 0;

  if (!hasStack && !hasMemory && !hasStorage) {
    return (
      <tr>
        <td
          colSpan={6}
          className="px-3 py-2 text-xs"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            color: "var(--color-text-muted)",
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
        className="px-3 py-3"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        <div className="space-y-3 text-xs">
          {/* Stack */}
          {hasStack && (
            <div>
              <span
                className="font-medium block mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Stack ({step.stack.length} items):
              </span>
              <div
                className="p-2 rounded font-mono max-h-32 overflow-y-auto space-y-0.5"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  fontSize: "0.65rem",
                }}
              >
                {step.stack
                  .slice()
                  .reverse()
                  .map((val, i) => (
                    <div key={i} className="flex gap-2">
                      <span
                        className="w-6 flex-shrink-0 text-right"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {step.stack.length - 1 - i}
                      </span>
                      <span
                        className="break-all"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {val}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Memory */}
          {hasMemory && (
            <div>
              <span
                className="font-medium block mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Memory ({step.memory.length} words):
              </span>
              <div
                className="p-2 rounded font-mono max-h-24 overflow-y-auto"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  fontSize: "0.65rem",
                  color: "var(--color-text-primary)",
                }}
              >
                {step.memory.slice(0, 16).map((word, i) => (
                  <div key={i} className="flex gap-2">
                    <span
                      className="w-10 flex-shrink-0 text-right"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      0x{(i * 32).toString(16).padStart(4, "0")}
                    </span>
                    <span className="break-all">{word}</span>
                  </div>
                ))}
                {step.memory.length > 16 && (
                  <div style={{ color: "var(--color-text-muted)" }}>
                    ... {step.memory.length - 16} more words
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Storage */}
          {hasStorage && (
            <div>
              <span
                className="font-medium block mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Storage changes:
              </span>
              <div
                className="p-2 rounded font-mono max-h-24 overflow-y-auto space-y-1"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  fontSize: "0.65rem",
                }}
              >
                {Object.entries(step.storage).map(([slot, value]) => (
                  <div key={slot} className="flex gap-2">
                    <span style={{ color: "var(--color-warning)" }}>
                      {slot}
                    </span>
                    <span style={{ color: "var(--color-text-muted)" }}>=&gt;</span>
                    <span
                      className="break-all"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface OpcodeViewerProps {
  steps: OpcodeStep[];
}

export default function OpcodeViewer({ steps }: OpcodeViewerProps) {
  const [displayCount, setDisplayCount] = useState(ROWS_PER_PAGE);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [filterOp, setFilterOp] = useState("");

  const handleLoadMore = useCallback(() => {
    setDisplayCount((prev) => prev + ROWS_PER_PAGE);
  }, []);

  // Filter steps
  const filteredSteps = filterOp
    ? steps.filter((s) =>
        s.op.toLowerCase().includes(filterOp.toLowerCase()),
      )
    : steps;

  const visibleSteps = filteredSteps.slice(0, displayCount);
  const hasMore = displayCount < filteredSteps.length;

  return (
    <div
      className="rounded-lg border"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      {/* Header */}
      <div
        className="p-4 border-b flex items-center justify-between"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <div className="flex items-center gap-3">
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Opcode Trace
          </h3>
          <span
            className="text-xs"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {filteredSteps.length.toLocaleString()} steps
            {filterOp && ` (filtered from ${steps.length.toLocaleString()})`}
          </span>
        </div>
        <input
          type="text"
          placeholder="Filter opcodes..."
          value={filterOp}
          onChange={(e) => {
            setFilterOp(e.target.value);
            setDisplayCount(ROWS_PER_PAGE);
          }}
          className="px-3 py-1.5 rounded border text-xs w-40"
          style={{
            backgroundColor: "var(--color-bg-input)",
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
          }}
        />
      </div>

      {/* Legend */}
      <div
        className="px-4 py-2 border-b flex flex-wrap gap-3"
        style={{ borderColor: "var(--color-border-muted)" }}
      >
        {[
          { label: "Stack", color: "#6366f1" },
          { label: "Memory", color: "#22c55e" },
          { label: "Storage", color: "#f97316" },
          { label: "Calls", color: "#ef4444" },
          { label: "Logging", color: "#eab308" },
          { label: "Hash", color: "#06b6d4" },
          { label: "Control", color: "#64748b" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1 text-xs">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto" style={{ maxHeight: "600px", overflowY: "auto" }}>
        <table className="w-full text-xs">
          <thead
            className="sticky top-0"
            style={{ backgroundColor: "var(--color-bg-secondary)" }}
          >
            <tr
              className="border-b"
              style={{ borderColor: "var(--color-border-default)" }}
            >
              <th
                className="text-left py-2 px-3 font-medium w-16"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Step
              </th>
              <th
                className="text-left py-2 px-3 font-medium w-16"
                style={{ color: "var(--color-text-secondary)" }}
              >
                PC
              </th>
              <th
                className="text-left py-2 px-3 font-medium w-32"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Opcode
              </th>
              <th
                className="text-right py-2 px-3 font-medium w-24"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Gas
              </th>
              <th
                className="text-right py-2 px-3 font-medium w-24"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Gas Cost
              </th>
              <th
                className="text-right py-2 px-3 font-medium w-16"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Depth
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleSteps.map((step, i) => {
              const globalIndex = filterOp
                ? steps.indexOf(step)
                : i;
              const isExpanded = expandedRow === globalIndex;
              const expensive = isExpensiveOp(step.op);

              return (
                <>
                  <tr
                    key={`row-${globalIndex}`}
                    className="border-b cursor-pointer transition-colors"
                    style={{
                      borderColor: "var(--color-border-muted)",
                      backgroundColor: isExpanded
                        ? "var(--color-bg-tertiary)"
                        : expensive
                          ? "rgba(248, 81, 73, 0.04)"
                          : "transparent",
                    }}
                    onClick={() =>
                      setExpandedRow(isExpanded ? null : globalIndex)
                    }
                  >
                    <td
                      className="py-1.5 px-3 font-mono"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {globalIndex}
                    </td>
                    <td
                      className="py-1.5 px-3 font-mono"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {step.pc}
                    </td>
                    <td className="py-1.5 px-3 font-mono font-semibold">
                      <span style={{ color: getOpcodeColor(step.op) }}>
                        {step.op}
                      </span>
                      {expensive && (
                        <span
                          className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: "var(--color-danger)" }}
                          title="Expensive operation"
                        />
                      )}
                    </td>
                    <td
                      className="py-1.5 px-3 text-right font-mono"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {step.gas.toLocaleString()}
                    </td>
                    <td
                      className="py-1.5 px-3 text-right font-mono font-medium"
                      style={{
                        color: expensive
                          ? "var(--color-warning)"
                          : "var(--color-text-primary)",
                      }}
                    >
                      {step.gasCost.toLocaleString()}
                    </td>
                    <td
                      className="py-1.5 px-3 text-right font-mono"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {step.depth}
                    </td>
                  </tr>
                  {isExpanded && (
                    <ExpandedDetail
                      key={`detail-${globalIndex}`}
                      step={step}
                    />
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {hasMore && (
        <div
          className="p-4 border-t text-center"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          <button
            onClick={handleLoadMore}
            className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-accent-muted)",
              color: "var(--color-accent)",
            }}
          >
            Load {Math.min(ROWS_PER_PAGE, filteredSteps.length - displayCount).toLocaleString()} more
            steps ({(filteredSteps.length - displayCount).toLocaleString()} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
