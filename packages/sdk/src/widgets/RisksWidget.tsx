import { useMemo, type CSSProperties } from "react";
import type { AnalyzeRisksOptions, TraceFrame } from "../types.js";
import { analyzeRisks } from "../risks/analyzeRisks.js";
import {
  FindingsPanel,
  type FindingsPanelClassNames,
} from "../components/FindingsPanel.js";

export interface RisksWidgetProps {
  /** Root of the call trace to analyze. */
  frame: TraceFrame;
  /**
   * Options forwarded to `analyzeRisks` — `whitelist`,
   * `largeApprovalThreshold`, `classifyAddress`. Memoized identity matters:
   * the widget re-runs the analyzer only when this prop changes (use
   * `useMemo` in the parent for stable identity).
   */
  options?: AnalyzeRisksOptions;
  /** Click handler — invoked with the clicked finding. */
  onSelect?: (riskIndex: number) => void;
  /** Hide the header (title + counts). */
  hideHeader?: boolean;
  /** Message shown when no risks were found. */
  emptyMessage?: string;
  /** Per-slot class names. */
  classNames?: FindingsPanelClassNames;
  /** Inline style on the root element. */
  style?: CSSProperties;
  /** className on the root element. */
  className?: string;
}

/**
 * Drop-in risk summary: runs `analyzeRisks(frame, options)` and renders the
 * findings via `<FindingsPanel>`. The analysis is memoized on
 * `[frame, options]`, so consumers should pass stable identities (typically
 * via `useMemo` upstream) to avoid re-running on every render.
 *
 * Typical use:
 * ```tsx
 * <RisksWidget frame={traceResult.trace} />
 * ```
 */
export function RisksWidget({
  frame,
  options,
  onSelect,
  hideHeader,
  emptyMessage,
  classNames,
  style,
  className,
}: RisksWidgetProps): React.JSX.Element {
  const risks = useMemo(() => analyzeRisks(frame, options), [frame, options]);
  return (
    <FindingsPanel
      risks={risks}
      onSelect={onSelect ? (_risk) => onSelect(risks.indexOf(_risk)) : undefined}
      hideHeader={hideHeader}
      emptyMessage={emptyMessage}
      classNames={classNames}
      style={style}
      className={className}
    />
  );
}
