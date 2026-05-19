import { useMemo, type CSSProperties } from "react";
import type { TraceFrame } from "../types.js";
import { parseApprovals } from "../parsers/approvals.js";
import {
  ApprovalsPanel,
  type ApprovalsPanelClassNames,
} from "../components/ApprovalsPanel.js";

export interface ApprovalsWidgetProps {
  /** Root of the call trace to scan for ERC-20 Approval events. */
  frame: TraceFrame;
  /**
   * Threshold at or above which to show the "UNLIMITED" badge. Defaults to
   * `2n ** 256n - 1n` (literal max). Lower to e.g. `2n ** 128n` to badge
   * common phishing variants — keep this aligned with
   * `analyzeRisks({ largeApprovalThreshold })` to avoid mixed signals.
   */
  unlimitedThreshold?: bigint;
  /** Hide the header (title + count). */
  hideHeader?: boolean;
  /** Override the panel title. Default: "Approvals". */
  title?: string;
  /** Per-slot class names. */
  classNames?: ApprovalsPanelClassNames;
  /** Inline style on the root element. */
  style?: CSSProperties;
  /** className on the root element. */
  className?: string;
}

/**
 * Drop-in approvals summary: runs `parseApprovals(frame)` and renders the
 * result via `<ApprovalsPanel>`. ERC-721 Approvals (which share the topic
 * hash but have a different topic count) are filtered out by the parser.
 */
export function ApprovalsWidget({
  frame,
  unlimitedThreshold,
  hideHeader,
  title,
  classNames,
  style,
  className,
}: ApprovalsWidgetProps): React.JSX.Element {
  const approvals = useMemo(() => parseApprovals(frame), [frame]);
  return (
    <ApprovalsPanel
      approvals={approvals}
      unlimitedThreshold={unlimitedThreshold}
      hideHeader={hideHeader}
      title={title}
      classNames={classNames}
      style={style}
      className={className}
    />
  );
}
