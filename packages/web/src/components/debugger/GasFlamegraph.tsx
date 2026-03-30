import { useState, useMemo, useCallback } from "react";
import type { CallFrame } from "../../api/debugger";
import { lookupWellKnown } from "../../lib/wellKnownSignatures";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlamegraphBar {
  frame: CallFrame;
  depth: number;
  startGas: number; // cumulative gas offset from left
  width: number; // gas consumed by this frame
  label: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Colors by call type
// ---------------------------------------------------------------------------

const CALL_COLORS: Record<string, string> = {
  CALL: "#6366f1",
  STATICCALL: "#22c55e",
  DELEGATECALL: "#a78bfa",
  CALLCODE: "#a78bfa",
  CREATE: "#06b6d4",
  CREATE2: "#06b6d4",
};

function getBarColor(type: string, depth: number): string {
  const base = CALL_COLORS[type] ?? "#8B5CF6";
  // Alternate brightness by depth for visual separation
  const lighten = depth % 2 === 0 ? 0 : 15;
  return adjustBrightness(base, lighten);
}

function adjustBrightness(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------------------------------------------------------------------------
// Build flat bar list from call tree
// ---------------------------------------------------------------------------

function buildFlamegraph(root: CallFrame, signatureMap: Record<string, unknown>): FlamegraphBar[] {
  const bars: FlamegraphBar[] = [];
  const totalGas = parseInt(root.gasUsed) || 1;

  function walk(frame: CallFrame, depth: number, startGas: number) {
    const gasUsed = parseInt(frame.gasUsed) || 0;
    const selector = frame.input?.length >= 10 ? frame.input.slice(0, 10).toLowerCase() : "";
    const wk = selector ? lookupWellKnown(selector) : undefined;
    const sigMatch = selector && signatureMap[selector]
      ? (signatureMap[selector] as Array<{ textSignature: string }>)?.[0]?.textSignature
      : undefined;
    const resolved = wk?.signature ?? sigMatch;
    const funcName = resolved ? resolved.split("(")[0]! : selector || frame.type;
    const contractLabel = wk?.interface ?? "";
    const label = contractLabel ? `${contractLabel}.${funcName}` : funcName;

    bars.push({
      frame,
      depth,
      startGas,
      width: gasUsed,
      label,
      color: getBarColor(frame.type, depth),
    });

    // Layout children sequentially within this frame's gas range
    let childOffset = startGas;
    for (const child of frame.calls ?? []) {
      const childGas = parseInt(child.gasUsed) || 0;
      walk(child, depth + 1, childOffset);
      childOffset += childGas;
    }
  }

  walk(root, 0, 0);

  // Normalize widths as percentages of total gas
  for (const bar of bars) {
    bar.startGas = (bar.startGas / totalGas) * 100;
    bar.width = (bar.width / totalGas) * 100;
  }

  return bars;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GasFlamegraphProps {
  callTrace: CallFrame;
  signatureMap: Record<string, unknown>;
  onSelectFrame?: (frame: CallFrame) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const BAR_HEIGHT = 22;
const MIN_BAR_WIDTH = 0.3; // minimum percentage width to be visible

export default function GasFlamegraph({ callTrace, signatureMap, onSelectFrame }: GasFlamegraphProps) {
  const [hoveredBar, setHoveredBar] = useState<FlamegraphBar | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const bars = useMemo(
    () => buildFlamegraph(callTrace, signatureMap),
    [callTrace, signatureMap],
  );

  const maxDepth = useMemo(
    () => bars.reduce((max, b) => Math.max(max, b.depth), 0),
    [bars],
  );

  const totalGas = parseInt(callTrace.gasUsed) || 0;

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div className="card overflow-hidden">
      <div className="card-divider px-3 py-2 flex items-center justify-between" style={{ backgroundColor: "var(--color-bg-secondary)" }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-secondary)" }}>
          Gas Flamegraph
        </span>
        <span className="text-xs" style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
          {totalGas.toLocaleString()} gas total
        </span>
      </div>

      <div
        className="relative overflow-x-auto"
        style={{ height: (maxDepth + 1) * BAR_HEIGHT + 4 }}
        onMouseMove={handleMouseMove}
      >
        {bars.map((bar, i) => {
          if (bar.width < MIN_BAR_WIDTH) return null;

          return (
            <div
              key={i}
              className="absolute cursor-pointer text-xs overflow-hidden"
              onClick={() => onSelectFrame?.(bar.frame)}
              onMouseEnter={() => setHoveredBar(bar)}
              onMouseLeave={() => setHoveredBar(null)}
              style={{
                left: `${bar.startGas}%`,
                width: `${bar.width}%`,
                top: bar.depth * BAR_HEIGHT + 2,
                height: BAR_HEIGHT - 2,
                backgroundColor: bar.color,
                opacity: hoveredBar === bar ? 1 : 0.85,
                fontFamily: "var(--font-mono)",
                lineHeight: `${BAR_HEIGHT - 2}px`,
                paddingLeft: 4,
                paddingRight: 4,
                color: "#fff",
                whiteSpace: "nowrap",
                boxShadow: hoveredBar === bar ? "inset 0 0 0 1px rgba(255,255,255,0.5)" : "inset 0 0 0 1px rgba(0,0,0,0.15)",
              }}
            >
              {bar.width > 3 ? bar.label : ""}
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {hoveredBar && (
        <div
          className="fixed z-50 px-3 py-2 text-xs whitespace-nowrap"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 40,
            backgroundColor: "var(--color-bg-secondary)",
            boxShadow: "inset 0 0 0 1px var(--color-border-default), 0 4px 12px rgba(0,0,0,0.5)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
            pointerEvents: "none",
          }}
        >
          <div className="font-semibold">{hoveredBar.label}</div>
          <div style={{ color: "var(--color-text-muted)" }}>
            gas: {parseInt(hoveredBar.frame.gasUsed).toLocaleString()} ({hoveredBar.width.toFixed(1)}%)
          </div>
          <div style={{ color: "var(--color-text-muted)" }}>
            type: {hoveredBar.frame.type}
          </div>
          {hoveredBar.frame.to && (
            <div style={{ color: "var(--color-text-muted)" }}>
              to: {hoveredBar.frame.to}
            </div>
          )}
          {hoveredBar.frame.error && (
            <div style={{ color: "var(--color-danger)" }}>
              error: {hoveredBar.frame.error}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-3 py-2" style={{ borderTop: "none" }}>
        {Object.entries(CALL_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            <div className="w-3 h-3" style={{ backgroundColor: color }} />
            {type}
          </div>
        ))}
      </div>
    </div>
  );
}
