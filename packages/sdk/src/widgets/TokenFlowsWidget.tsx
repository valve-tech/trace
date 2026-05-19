import { useMemo, type CSSProperties } from "react";
import type { TraceFrame } from "../types.js";
import { parseTokenDeltas } from "../parsers/tokenDeltas.js";
import {
  TokenDeltasPanel,
  type TokenDeltasPanelClassNames,
} from "../components/TokenDeltasPanel.js";

export interface TokenFlowsWidgetProps {
  /** Root of the call trace to scan for ERC-20 Transfer events. */
  frame: TraceFrame;
  /** Hide the header (title + count). */
  hideHeader?: boolean;
  /** Override the panel title. Default: "Token Transfers". */
  title?: string;
  /** Per-slot class names. */
  classNames?: TokenDeltasPanelClassNames;
  /** Inline style on the root element. */
  style?: CSSProperties;
  /** className on the root element. */
  className?: string;
}

/**
 * Drop-in token-flows summary: runs `parseTokenDeltas(frame)` and renders the
 * result via `<TokenDeltasPanel>`. ERC-721 Transfers share the topic hash
 * but have 4 topics — filtered out by the parser. ERC-1155 transfers use
 * different topic hashes and are not decoded.
 */
export function TokenFlowsWidget({
  frame,
  hideHeader,
  title,
  classNames,
  style,
  className,
}: TokenFlowsWidgetProps): React.JSX.Element {
  const deltas = useMemo(() => parseTokenDeltas(frame), [frame]);
  return (
    <TokenDeltasPanel
      deltas={deltas}
      hideHeader={hideHeader}
      title={title}
      classNames={classNames}
      style={style}
      className={className}
    />
  );
}
