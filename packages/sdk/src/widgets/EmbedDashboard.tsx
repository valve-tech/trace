import { useMemo, useState, type CSSProperties } from "react";
import type { AnalyzeRisksOptions, TraceFrame } from "../types.js";
import { analyzeRisks } from "../risks/analyzeRisks.js";
import { parseSwaps } from "../parsers/swaps.js";
import { parseApprovals } from "../parsers/approvals.js";
import { parseTokenDeltas } from "../parsers/tokenDeltas.js";
import { FindingsPanel } from "../components/FindingsPanel.js";
import { SwapsPanel } from "../components/SwapsPanel.js";
import { ApprovalsPanel } from "../components/ApprovalsPanel.js";
import { TokenDeltasPanel } from "../components/TokenDeltasPanel.js";

export type EmbedDashboardTab = "risks" | "swaps" | "approvals" | "transfers";

export interface EmbedDashboardClassNames {
  /** Outer wrapper. */
  root?: string;
  /** Tab bar container. */
  tabs?: string;
  /** A single tab button. */
  tab?: string;
  /** The currently selected tab button. */
  tabActive?: string;
  /** Count badge on a tab. */
  count?: string;
  /** Panel container (everything below the tab bar). */
  panel?: string;
}

export interface EmbedDashboardProps {
  /** Root of the trace to summarize. */
  frame: TraceFrame;
  /** Options forwarded to `analyzeRisks`. */
  risksOptions?: AnalyzeRisksOptions;
  /** Initial active tab. Default: the first tab with any data. */
  defaultTab?: EmbedDashboardTab;
  /** Hide individual tabs (e.g. for an approvals-only embed). */
  hideTabs?: EmbedDashboardTab[];
  /** Per-slot class names. */
  classNames?: EmbedDashboardClassNames;
  /** Inline style on the root. */
  style?: CSSProperties;
  /** className on the root. */
  className?: string;
}

interface TabSpec {
  id: EmbedDashboardTab;
  label: string;
  count: number;
}

/**
 * One-line drop-in summary of a transaction's effects: tabs over risks,
 * swaps, approvals, and token transfers, each rendered by the corresponding
 * SDK panel. Picks a sensible default tab — the first non-empty bucket — so
 * the embed is informative even without per-page configuration.
 *
 * Designed as the "data + components = beautiful UI" entry point. Drop into
 * a single line of JSX:
 * ```tsx
 * <EmbedDashboard frame={traceResult.trace} />
 * ```
 */
export function EmbedDashboard({
  frame,
  risksOptions,
  defaultTab,
  hideTabs = [],
  classNames = {},
  style,
  className,
}: EmbedDashboardProps): React.JSX.Element {
  const risks = useMemo(() => analyzeRisks(frame, risksOptions), [frame, risksOptions]);
  const swaps = useMemo(() => parseSwaps(frame), [frame]);
  const approvals = useMemo(() => parseApprovals(frame), [frame]);
  const deltas = useMemo(() => parseTokenDeltas(frame), [frame]);

  const allTabs: TabSpec[] = [
    { id: "risks", label: "Risks", count: risks.length },
    { id: "swaps", label: "Swaps", count: swaps.length },
    { id: "approvals", label: "Approvals", count: approvals.length },
    { id: "transfers", label: "Transfers", count: deltas.length },
  ];
  const visibleTabs = allTabs.filter((t) => !hideTabs.includes(t.id));
  const fallbackTab =
    visibleTabs.find((t) => t.count > 0)?.id ?? visibleTabs[0]?.id ?? "risks";
  const initialTab = defaultTab && !hideTabs.includes(defaultTab)
    ? defaultTab
    : fallbackTab;

  const [activeTab, setActiveTab] = useState<EmbedDashboardTab>(initialTab);

  return (
    <div
      className={[className, classNames.root].filter(Boolean).join(" ")}
      style={{
        borderRadius: 8,
        border: "1px solid rgba(139, 148, 158, 0.2)",
        backgroundColor: "rgba(139, 148, 158, 0.03)",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <div
        className={classNames.tabs}
        role="tablist"
        style={{
          display: "flex",
          gap: 4,
          padding: "8px 8px 0 8px",
          borderBottom: "1px solid rgba(139, 148, 158, 0.2)",
        }}
      >
        {visibleTabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                classNames.tab,
                isActive && classNames.tabActive,
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 500,
                border: "none",
                borderBottom: isActive
                  ? "2px solid #f59e0b"
                  : "2px solid transparent",
                background: "transparent",
                color: isActive ? "#f0f6fc" : "#8b949e",
                cursor: "pointer",
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
                marginBottom: -1,
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={classNames.count}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 6px",
                    borderRadius: 8,
                    backgroundColor: "rgba(245, 158, 11, 0.18)",
                    color: "#f59e0b",
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        className={classNames.panel}
        role="tabpanel"
        style={{ padding: 8 }}
      >
        {activeTab === "risks" && (
          <FindingsPanel
            risks={risks}
            classNames={{ root: "embed-no-border" }}
            style={{ border: "none", borderRadius: 0, background: "transparent" }}
          />
        )}
        {activeTab === "swaps" && (
          <SwapsPanel
            swaps={swaps}
            style={{ border: "none", borderRadius: 0, background: "transparent" }}
          />
        )}
        {activeTab === "approvals" && (
          <ApprovalsPanel
            approvals={approvals}
            style={{ border: "none", borderRadius: 0, background: "transparent" }}
          />
        )}
        {activeTab === "transfers" && (
          <TokenDeltasPanel
            deltas={deltas}
            style={{ border: "none", borderRadius: 0, background: "transparent" }}
          />
        )}
      </div>
    </div>
  );
}
