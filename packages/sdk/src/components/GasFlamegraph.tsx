import { useState, useMemo, useCallback, type CSSProperties } from "react";
import type { Hex } from "viem";
import type { TraceFrame } from "../types.js";
import {
  buildFlamegraphLayout,
  type FlamegraphBar,
  type LayoutOptions,
} from "./flamegraphLayout.js";
import { formatGas } from "./formatters.js";

export interface GasFlamegraphClassNames {
  root?: string;
  header?: string;
  chart?: string;
  bar?: string;
  tooltip?: string;
  legend?: string;
}

export interface GasFlamegraphProps {
  /** Root of the call tree. */
  frame: TraceFrame;
  /** Optional click handler for a bar. */
  onSelect?: (frame: TraceFrame) => void;
  /** Resolve a 4-byte selector to a readable label (e.g. "transfer"). */
  resolveSelector?: LayoutOptions["resolveSelector"];
  /** Bar pixel height. Default 22. */
  barHeight?: number;
  /** Minimum percentage width for a bar to be drawn (smaller bars are
   *  omitted to avoid sub-pixel rendering). Default 0.3. */
  minBarWidth?: number;
  /** Hide the header bar. */
  hideHeader?: boolean;
  /** Hide the legend strip. */
  hideLegend?: boolean;
  /** Per-slot class names for theming. */
  classNames?: GasFlamegraphClassNames;
  /** Inline style on the root element. */
  style?: CSSProperties;
  /** className on the root. */
  className?: string;
}

const DEFAULT_BAR_HEIGHT = 22;
const DEFAULT_MIN_BAR_WIDTH = 0.3;

/**
 * Chrome-DevTools-style horizontal flamegraph. Each row is a depth level;
 * each bar's width is proportional to the frame's gas usage. Bars below
 * `minBarWidth` percent are hidden for legibility.
 *
 * Headless: default colors and layout are built in; consumers theme via
 * `classNames`, `className`, or `style` on the root.
 */
export function GasFlamegraph({
  frame,
  onSelect,
  resolveSelector,
  barHeight = DEFAULT_BAR_HEIGHT,
  minBarWidth = DEFAULT_MIN_BAR_WIDTH,
  hideHeader = false,
  hideLegend = false,
  classNames = {},
  style,
  className,
}: GasFlamegraphProps): React.JSX.Element {
  const [hovered, setHovered] = useState<FlamegraphBar | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const bars = useMemo(
    () => buildFlamegraphLayout(frame, { resolveSelector }),
    [frame, resolveSelector],
  );

  const maxDepth = useMemo(
    () => bars.reduce((m, b) => Math.max(m, b.depth), 0),
    [bars],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      className={[className, classNames.root].filter(Boolean).join(" ")}
      style={{
        borderRadius: 8,
        border: "1px solid rgba(139, 148, 158, 0.2)",
        overflow: "hidden",
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
            padding: "8px 12px",
            backgroundColor: "rgba(139, 148, 158, 0.08)",
            borderBottom: "1px solid rgba(139, 148, 158, 0.2)",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#8b949e",
            }}
          >
            Gas Flamegraph
          </span>
          <span
            style={{
              fontSize: 11,
              fontFamily: "monospace",
              color: "#6e7681",
            }}
          >
            {formatGas(frame.gasUsed)} gas total
          </span>
        </div>
      )}

      <div
        className={classNames.chart}
        style={{
          position: "relative",
          overflowX: "auto",
          height: (maxDepth + 1) * barHeight + 4,
        }}
        onMouseMove={handleMouseMove}
      >
        {bars.map((bar, i) => {
          if (bar.width < minBarWidth) return null;
          return (
            <div
              key={i}
              className={classNames.bar}
              onClick={onSelect ? () => onSelect(bar.frame) : undefined}
              onMouseEnter={() => setHovered(bar)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: "absolute",
                cursor: onSelect ? "pointer" : "default",
                fontSize: 11,
                overflow: "hidden",
                left: `${bar.startGas}%`,
                width: `${bar.width}%`,
                top: bar.depth * barHeight + 2,
                height: barHeight - 2,
                backgroundColor: bar.color,
                opacity: hovered === bar ? 1 : 0.85,
                fontFamily: "monospace",
                lineHeight: `${barHeight - 2}px`,
                paddingLeft: 4,
                paddingRight: 4,
                color: "#fff",
                whiteSpace: "nowrap",
                boxShadow:
                  hovered === bar
                    ? "inset 0 0 0 1px rgba(255,255,255,0.5)"
                    : "inset 0 0 0 1px rgba(0,0,0,0.15)",
              }}
            >
              {bar.width > 3 ? bar.label : ""}
            </div>
          );
        })}
      </div>

      {hovered && (
        <div
          className={classNames.tooltip}
          style={{
            position: "fixed",
            zIndex: 50,
            padding: "8px 12px",
            fontSize: 11,
            whiteSpace: "nowrap",
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 40,
            backgroundColor: "rgba(13, 17, 23, 0.95)",
            boxShadow:
              "inset 0 0 0 1px rgba(139, 148, 158, 0.3), 0 4px 12px rgba(0,0,0,0.5)",
            color: "#c9d1d9",
            fontFamily: "monospace",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontWeight: 600 }}>{hovered.label}</div>
          <div style={{ color: "#8b949e" }}>
            gas: {formatGas(hovered.frame.gasUsed)} ({hovered.width.toFixed(1)}%)
          </div>
          <div style={{ color: "#8b949e" }}>type: {hovered.frame.type}</div>
          {hovered.frame.to && (
            <div style={{ color: "#8b949e" }}>to: {hovered.frame.to}</div>
          )}
          {hovered.frame.error && (
            <div style={{ color: "#ef4444" }}>
              error: {hovered.frame.error}
            </div>
          )}
        </div>
      )}

      {!hideLegend && (
        <div
          className={classNames.legend}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            padding: "8px 12px",
          }}
        >
          {(
            [
              ["CALL", "#6366f1"],
              ["STATICCALL", "#22c55e"],
              ["DELEGATECALL", "#a78bfa"],
              ["CREATE", "#06b6d4"],
            ] as const
          ).map(([type, color]) => (
            <div
              key={type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: "#6e7681",
              }}
            >
              <div
                style={{ width: 12, height: 12, backgroundColor: color }}
              />
              {type}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export the layout helpers so consumers can build custom renderers on
// the same data.
export {
  buildFlamegraphLayout,
  adjustBrightness,
  getBarColor,
  type FlamegraphBar,
  type LayoutOptions,
} from "./flamegraphLayout.js";

// Indirect-export wrapper for the `Hex` brand so the public API surface is
// self-contained without consumers needing to import viem directly.
export type { Hex };
