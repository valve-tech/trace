import { useMemo, type CSSProperties } from "react";
import type { TraceFrame } from "../types.js";
import { parseSwaps } from "../parsers/swaps.js";
import {
  SwapsPanel,
  type SwapsPanelClassNames,
} from "../components/SwapsPanel.js";

export interface SwapsWidgetProps {
  /** Root of the call trace to scan for swap events. */
  frame: TraceFrame;
  /** Hide the header (title + count). */
  hideHeader?: boolean;
  /** Override the panel title. Default: "Swaps". */
  title?: string;
  /** Per-slot class names. */
  classNames?: SwapsPanelClassNames;
  /** Inline style on the root element. */
  style?: CSSProperties;
  /** className on the root element. */
  className?: string;
}

/**
 * Drop-in swaps summary: runs `parseSwaps(frame)` and renders the result via
 * `<SwapsPanel>`. Memoizes the decode pass on `frame`, so passing a stable
 * trace reference re-renders cheaply.
 *
 * Detects Uniswap V1/V2/V3 (and V2/V3-compatible forks) swap events. V4
 * hook-style pools are not yet decoded — see `parseSwaps` docs.
 */
export function SwapsWidget({
  frame,
  hideHeader,
  title,
  classNames,
  style,
  className,
}: SwapsWidgetProps): React.JSX.Element {
  const swaps = useMemo(() => parseSwaps(frame), [frame]);
  return (
    <SwapsPanel
      swaps={swaps}
      hideHeader={hideHeader}
      title={title}
      classNames={classNames}
      style={style}
      className={className}
    />
  );
}
