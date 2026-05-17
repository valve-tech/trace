import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type {
  OpcodeStep,
  RiskFlag,
  StateDiff,
  TraceFrame,
} from "../types.js";
import { CallTree } from "../components/CallTree.js";
import { OpcodeViewer } from "../components/OpcodeViewer.js";
import { StateDiffPanel } from "../components/StateDiffPanel.js";
import { FindingsPanel } from "../components/FindingsPanel.js";
import { FrameDetailPanel } from "../components/FrameDetailPanel.js";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

export type FullDebuggerTabId = "trace" | "opcodes" | "state" | "risks";

const TAB_LABEL: Record<FullDebuggerTabId, string> = {
  trace: "Call Tree",
  opcodes: "Opcodes",
  state: "State Diff",
  risks: "Risks",
};

const TAB_ORDER: FullDebuggerTabId[] = ["trace", "opcodes", "state", "risks"];

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const NEUTRAL_TEXT = "#c9d1d9";
const MUTED_TEXT = "#8b949e";
const TAB_ACTIVE_BG = "rgba(139, 92, 246, 0.15)";
const TAB_ACTIVE_BORDER = "#8B5CF6";

export interface FullDebuggerLayoutClassNames {
  /** Outer wrapper. */
  root?: string;
  /** Tab bar row. */
  tabBar?: string;
  /** Single tab button. */
  tab?: string;
  /** Active tab modifier (applied in addition to .tab). */
  tabActive?: string;
  /** Content area below the tab bar. */
  content?: string;
  /** Empty-state container shown when a tab's data is missing. */
  empty?: string;
}

export interface FullDebuggerLayoutProps {
  /** Canonical call trace. Required for the "trace" tab to render meaningfully. */
  trace?: TraceFrame;
  /** Canonical opcode steps. Required for the "opcodes" tab. */
  opcodes?: OpcodeStep[];
  /** State diffs. Required for the "state" tab. */
  stateDiffs?: StateDiff[];
  /** Risk findings. Required for the "risks" tab. */
  risks?: RiskFlag[];
  /** Which tab is selected on first render. Default: "trace". */
  defaultTab?: FullDebuggerTabId;
  /** Hide specific tabs entirely (rather than show their empty state). */
  hideTabs?: FullDebuggerTabId[];
  /** Symbol used in CallTree and FrameDetailPanel for values. Default: "PLS". */
  valueSymbol?: string;
  /** Per-slot class names. */
  classNames?: FullDebuggerLayoutClassNames;
  /** Inline style on root. */
  style?: CSSProperties;
  /** className on root. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
};

const tabBarStyle: CSSProperties = {
  display: "flex",
  gap: "4px",
  borderBottom: "1px solid rgba(139, 148, 158, 0.2)",
  paddingBottom: "0",
};

const tabStyle = (active: boolean): CSSProperties => ({
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.03em",
  color: active ? NEUTRAL_TEXT : MUTED_TEXT,
  background: active ? TAB_ACTIVE_BG : "transparent",
  borderBottom: active
    ? `2px solid ${TAB_ACTIVE_BORDER}`
    : "2px solid transparent",
  marginBottom: "-1px",
  borderTopLeftRadius: "4px",
  borderTopRightRadius: "4px",
  userSelect: "none" as const,
});

const emptyStyle: CSSProperties = {
  padding: "20px",
  textAlign: "center",
  color: MUTED_TEXT,
  fontSize: "13px",
  background: "rgba(13, 17, 23, 0.3)",
  borderRadius: "6px",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * One-stop tabbed debugger view that composes the SDK's primitives. Pass
 * whatever data you have — each tab independently renders its own empty
 * state when its required data is absent, so the layout is safe to drop in
 * even before async data has arrived.
 *
 * The "trace" tab additionally renders a `<FrameDetailPanel>` underneath
 * the `<CallTree>`, wired to the tree's `onSelect` so clicking a frame
 * opens its details inline. Selection state resets when the trace changes.
 */
export function FullDebuggerLayout({
  trace,
  opcodes,
  stateDiffs,
  risks,
  defaultTab = "trace",
  hideTabs,
  valueSymbol = "PLS",
  classNames,
  style,
  className,
}: FullDebuggerLayoutProps): React.JSX.Element {
  const hidden = useMemo(() => new Set(hideTabs ?? []), [hideTabs]);
  const visibleTabs = TAB_ORDER.filter((t) => !hidden.has(t));
  const initialTab = visibleTabs.includes(defaultTab)
    ? defaultTab
    : (visibleTabs[0] ?? "trace");
  const [activeTab, setActiveTab] = useState<FullDebuggerTabId>(initialTab);
  const [selectedFrame, setSelectedFrame] = useState<TraceFrame | null>(null);

  // Reset selected frame when the trace identity changes — a different
  // trace's frames are not meaningful in this one's context.
  useEffect(() => {
    setSelectedFrame(null);
  }, [trace]);

  return (
    <div
      className={[classNames?.root, className].filter(Boolean).join(" ") || undefined}
      style={{ ...containerStyle, ...style }}
    >
      <div className={classNames?.tabBar} style={tabBarStyle}>
        {visibleTabs.map((tab) => {
          const active = tab === activeTab;
          const tabClassName =
            [classNames?.tab, active ? classNames?.tabActive : undefined]
              .filter(Boolean)
              .join(" ") || undefined;
          return (
            <div
              key={tab}
              role="tab"
              aria-selected={active}
              className={tabClassName}
              style={tabStyle(active)}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABEL[tab]}
            </div>
          );
        })}
      </div>

      <div className={classNames?.content}>
        {activeTab === "trace" && (
          <TraceTab
            trace={trace}
            valueSymbol={valueSymbol}
            selectedFrame={selectedFrame}
            onSelectFrame={setSelectedFrame}
            classNames={classNames}
          />
        )}
        {activeTab === "opcodes" && (
          <OpcodesTab opcodes={opcodes} classNames={classNames} />
        )}
        {activeTab === "state" && (
          <StateTab
            stateDiffs={stateDiffs}
            valueSymbol={valueSymbol}
            classNames={classNames}
          />
        )}
        {activeTab === "risks" && (
          <RisksTab risks={risks} classNames={classNames} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab bodies
// ---------------------------------------------------------------------------

interface TraceTabProps {
  trace: TraceFrame | undefined;
  valueSymbol: string;
  selectedFrame: TraceFrame | null;
  onSelectFrame: (frame: TraceFrame) => void;
  classNames?: FullDebuggerLayoutClassNames;
}

function TraceTab({
  trace,
  valueSymbol,
  selectedFrame,
  onSelectFrame,
  classNames,
}: TraceTabProps): React.JSX.Element {
  if (!trace) return <EmptyState message="No trace loaded." classNames={classNames} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <CallTree
        frame={trace}
        onSelect={onSelectFrame}
        valueSymbol={valueSymbol}
      />
      {selectedFrame && (
        <FrameDetailPanel frame={selectedFrame} valueSymbol={valueSymbol} />
      )}
    </div>
  );
}

interface OpcodesTabProps {
  opcodes: OpcodeStep[] | undefined;
  classNames?: FullDebuggerLayoutClassNames;
}

function OpcodesTab({
  opcodes,
  classNames,
}: OpcodesTabProps): React.JSX.Element {
  if (!opcodes || opcodes.length === 0) {
    return <EmptyState message="No opcode trace available." classNames={classNames} />;
  }
  return <OpcodeViewer steps={opcodes} />;
}

interface StateTabProps {
  stateDiffs: StateDiff[] | undefined;
  valueSymbol: string;
  classNames?: FullDebuggerLayoutClassNames;
}

function StateTab({
  stateDiffs,
  valueSymbol,
  classNames,
}: StateTabProps): React.JSX.Element {
  if (!stateDiffs) {
    return <EmptyState message="No state diff data available." classNames={classNames} />;
  }
  return <StateDiffPanel diffs={stateDiffs} valueSymbol={valueSymbol} />;
}

interface RisksTabProps {
  risks: RiskFlag[] | undefined;
  classNames?: FullDebuggerLayoutClassNames;
}

function RisksTab({ risks, classNames }: RisksTabProps): React.JSX.Element {
  if (!risks) {
    return <EmptyState message="No risk analysis available." classNames={classNames} />;
  }
  return <FindingsPanel risks={risks} />;
}

interface EmptyStateProps {
  message: string;
  classNames?: FullDebuggerLayoutClassNames;
}

function EmptyState({
  message,
  classNames,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className={classNames?.empty} style={emptyStyle}>
      {message}
    </div>
  );
}
