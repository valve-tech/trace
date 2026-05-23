import { useState } from "react";
import type { SlitherFinding } from "../../api/source";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FindingsPanelProps {
  findings: SlitherFinding[];
  onJumpToLine?: (file: string, line: number) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  High: "var(--color-danger)",
  Medium: "#F59E0B",
  Low: "#EAB308",
  Informational: "#60A5FA",
  Optimization: "#34D399",
};

const SEVERITY_ORDER: Record<string, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  Informational: 3,
  Optimization: 4,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FindingsPanel({ findings, onJumpToLine }: FindingsPanelProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);

  // Sort by severity
  const sorted = [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.impact] ?? 5) - (SEVERITY_ORDER[b.impact] ?? 5),
  );

  const filtered = filterSeverity
    ? sorted.filter((f) => f.impact === filterSeverity)
    : sorted;

  // Count by severity
  const counts = findings.reduce(
    (acc, f) => {
      acc[f.impact] = (acc[f.impact] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div
      className="rounded-lg bs overflow-hidden"
      style={{
        backgroundColor: "var(--color-bg-card)",
      }}
    >
      {/* Header with severity pills */}
      <div
        className="flex items-center justify-between px-3 py-2 bs-b"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
        }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Slither Findings
        </span>
        <div className="flex items-center gap-tight">
          <button
            onClick={() => setFilterSeverity(null)}
            className="text-xs px-2 py-0.5 rounded"
            style={{
              backgroundColor: !filterSeverity ? "var(--color-accent-muted)" : "transparent",
              color: !filterSeverity ? "var(--color-accent)" : "var(--color-text-muted)",
            }}
          >
            All ({findings.length})
          </button>
          {Object.entries(counts).map(([severity, count]) => (
            <button
              key={severity}
              onClick={() => setFilterSeverity(filterSeverity === severity ? null : severity)}
              className="text-xs px-2 py-0.5 rounded"
              style={{
                backgroundColor: filterSeverity === severity ? "var(--color-accent-muted)" : "transparent",
                color: SEVERITY_COLORS[severity] ?? "var(--color-text-muted)",
              }}
            >
              {count} {severity}
            </button>
          ))}
        </div>
      </div>

      {/* Findings list */}
      <div className="overflow-y-auto" style={{ maxHeight: "400px" }}>
        {filtered.length === 0 ? (
          <div
            className="px-3 py-6 text-xs text-center"
            style={{ color: "var(--color-text-muted)" }}
          >
            {findings.length === 0 ? "No findings detected" : "No findings match filter"}
          </div>
        ) : (
          filtered.map((finding, i) => {
            const isExpanded = expandedIndex === i;
            const lines = finding.elements
              .flatMap((e) => e.sourceMapping?.lines ?? [])
              .filter((l, idx, arr) => arr.indexOf(l) === idx);

            return (
              <div
                key={i}
                className="bs-b last:shadow-none"
                style={{}}
              >
                {/* Finding header */}
                <button
                  onClick={() => setExpandedIndex(isExpanded ? null : i)}
                  className="w-full flex items-start gap-inline px-3 py-2 text-left hover:opacity-80"
                >
                  <span
                    className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                    style={{ backgroundColor: SEVERITY_COLORS[finding.impact] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-inline">
                      <span
                        className="text-xs font-semibold"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {finding.check}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: SEVERITY_COLORS[finding.impact] }}
                      >
                        {finding.impact}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        ({finding.confidence} confidence)
                      </span>
                    </div>
                    <p
                      className="text-xs mt-0.5 truncate"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {finding.description.split("\n")[0]}
                    </p>
                  </div>
                  <span
                    className="text-xs flex-shrink-0"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {isExpanded ? "▼" : "▶"}
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div
                    className="px-3 pb-3 space-y-2"
                    style={{ paddingLeft: "24px" }}
                  >
                    {/* Full description */}
                    <pre
                      className="text-xs whitespace-pre-wrap p-2 rounded"
                      style={{
                        backgroundColor: "var(--color-bg-primary)",
                        color: "var(--color-text-primary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {finding.description}
                    </pre>

                    {/* Affected elements */}
                    {finding.elements.length > 0 && (
                      <div>
                        <span
                          className="text-xs font-semibold"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          Affected:
                        </span>
                        <div className="flex flex-wrap gap-tight mt-1">
                          {finding.elements.map((el, j) => (
                            <span
                              key={j}
                              className="text-xs px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80"
                              style={{
                                backgroundColor: "var(--color-bg-secondary)",
                                color: "var(--color-text-primary)",
                                fontFamily: "var(--font-mono)",
                              }}
                              onClick={() => {
                                if (el.sourceMapping?.lines[0] && el.sourceMapping.filename_relative && onJumpToLine) {
                                  onJumpToLine(el.sourceMapping.filename_relative, el.sourceMapping.lines[0]);
                                }
                              }}
                            >
                              {el.type}: {el.name}
                              {el.sourceMapping?.lines[0] && ` (L${el.sourceMapping.lines[0]})`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Source lines */}
                    {lines.length > 0 && onJumpToLine && (
                      <div className="flex items-center gap-tight flex-wrap">
                        <span
                          className="text-xs"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          Lines:
                        </span>
                        {lines.slice(0, 10).map((line) => (
                          <button
                            key={line}
                            onClick={() => {
                              const file = finding.elements[0]?.sourceMapping?.filename_relative;
                              if (file) onJumpToLine(file, line);
                            }}
                            className="text-xs px-1 rounded hover:opacity-80"
                            style={{
                              backgroundColor: "var(--color-accent-muted)",
                              color: "var(--color-accent)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {line}
                          </button>
                        ))}
                        {lines.length > 10 && (
                          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                            +{lines.length - 10} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Markdown (Slither's detailed description) */}
                    {finding.markdown && (
                      <pre
                        className="text-xs whitespace-pre-wrap p-2 rounded"
                        style={{
                          backgroundColor: "var(--color-bg-primary)",
                          color: "var(--color-text-secondary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {finding.markdown}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
