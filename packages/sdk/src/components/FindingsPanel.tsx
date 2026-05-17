import { type CSSProperties } from "react";
import type { RiskFlag, RiskSeverity } from "../types.js";
import { truncateAddress } from "./formatters.js";

// ---------------------------------------------------------------------------
// Theme — default colors per severity. Override via classNames.
// ---------------------------------------------------------------------------

interface SeverityStyle {
  bg: string;
  text: string;
  label: string;
}

const DEFAULT_SEVERITY_STYLES: Record<RiskSeverity, SeverityStyle> = {
  danger: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", label: "DANGER" },
  warning: { bg: "rgba(251, 191, 36, 0.15)", text: "#fbbf24", label: "WARN" },
  info: { bg: "rgba(56, 189, 248, 0.15)", text: "#38bdf8", label: "INFO" },
};

// Severity ordering for grouping — most severe first.
const SEVERITY_ORDER: RiskSeverity[] = ["danger", "warning", "info"];

export interface FindingsPanelClassNames {
  /** Outer wrapper card. */
  root?: string;
  /** Header row (title + counts). */
  header?: string;
  /** Container for the list of findings. */
  list?: string;
  /** A row for one finding. */
  findingRow?: string;
  /** The severity badge on a finding. */
  severityBadge?: string;
  /** The rule-type chip (e.g. "DELEGATECALL_UNRECOGNIZED"). */
  typeChip?: string;
  /** The human-readable message. */
  message?: string;
  /** The address text. */
  address?: string;
  /** The depth/index metadata. */
  location?: string;
  /** The empty-state container. */
  empty?: string;
}

export interface FindingsPanelProps {
  /** Findings to render. */
  risks: RiskFlag[];
  /** Optional click handler — invoked with the clicked finding. */
  onSelect?: (risk: RiskFlag) => void;
  /** Hide the header (title + counts). */
  hideHeader?: boolean;
  /** Message shown when `risks` is empty. Default: "No risks detected." */
  emptyMessage?: string;
  /** Per-slot class names for theming. */
  classNames?: FindingsPanelClassNames;
  /** Inline style on the root element. */
  style?: CSSProperties;
  /** className on the root element (in addition to classNames.root). */
  className?: string;
}

function countBySeverity(risks: RiskFlag[]): Record<RiskSeverity, number> {
  const counts: Record<RiskSeverity, number> = { danger: 0, warning: 0, info: 0 };
  for (const r of risks) counts[r.severity]++;
  return counts;
}

function groupBySeverity(risks: RiskFlag[]): Map<RiskSeverity, RiskFlag[]> {
  const out = new Map<RiskSeverity, RiskFlag[]>();
  for (const sev of SEVERITY_ORDER) out.set(sev, []);
  for (const r of risks) out.get(r.severity)!.push(r);
  return out;
}

const containerStyle: CSSProperties = {
  padding: "12px 16px",
  background: "rgba(13, 17, 23, 0.4)",
  borderRadius: "8px",
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  fontSize: "13px",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 8px",
  cursor: "default",
};

const badgeStyle = (sev: RiskSeverity): CSSProperties => {
  const s = DEFAULT_SEVERITY_STYLES[sev];
  return {
    background: s.bg,
    color: s.text,
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.04em",
  };
};

const chipStyle: CSSProperties = {
  background: "rgba(139, 148, 158, 0.15)",
  color: "#8b949e",
  padding: "2px 6px",
  borderRadius: "4px",
  fontSize: "11px",
};

/**
 * Renders the output of `analyzeRisks` as a grouped, severity-ordered list.
 * Empty input renders an "all clear" message rather than nothing, so the
 * component is a useful drop-in next to a trace view.
 */
export function FindingsPanel({
  risks,
  onSelect,
  hideHeader,
  emptyMessage = "No risks detected.",
  classNames,
  style,
  className,
}: FindingsPanelProps): React.JSX.Element {
  const counts = countBySeverity(risks);
  const grouped = groupBySeverity(risks);

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
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <strong style={{ color: "#c9d1d9" }}>Findings</strong>
          <div style={{ display: "flex", gap: "6px" }}>
            {SEVERITY_ORDER.map((sev) => (
              <span key={sev} style={badgeStyle(sev)}>
                {DEFAULT_SEVERITY_STYLES[sev].label} {counts[sev]}
              </span>
            ))}
          </div>
        </div>
      )}

      {risks.length === 0 ? (
        <div
          className={classNames?.empty}
          style={{ color: "#8b949e", padding: "8px 0" }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div className={classNames?.list}>
          {SEVERITY_ORDER.map((sev) => {
            const items = grouped.get(sev)!;
            if (items.length === 0) return null;
            return items.map((risk, i) => (
              <div
                key={`${sev}-${i}`}
                className={classNames?.findingRow}
                style={{ ...rowStyle, cursor: onSelect ? "pointer" : "default" }}
                onClick={onSelect ? () => onSelect(risk) : undefined}
              >
                <span
                  className={classNames?.severityBadge}
                  style={badgeStyle(sev)}
                >
                  {DEFAULT_SEVERITY_STYLES[sev].label}
                </span>
                <span className={classNames?.typeChip} style={chipStyle}>
                  {risk.type}
                </span>
                <span
                  className={classNames?.message}
                  style={{ color: "#c9d1d9", flex: 1, minWidth: 0 }}
                >
                  {risk.message}
                </span>
                {risk.address && (
                  <span
                    className={classNames?.address}
                    style={{ color: "#8b949e" }}
                  >
                    {truncateAddress(risk.address)}
                  </span>
                )}
                <span
                  className={classNames?.location}
                  style={{ color: "#6e7681", fontSize: "11px" }}
                >
                  d{risk.depth}.{risk.childIndex}
                </span>
              </div>
            ));
          })}
        </div>
      )}
    </div>
  );
}
