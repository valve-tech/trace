import { useCallback, useEffect, useRef, useState } from "react";
import type { OpcodeStep } from "../../../api/debugger";
import { CollapsiblePanel } from "./CollapsiblePanel";
import { getOpcodeColor } from "./theme";

const VISIBLE_ROWS = 30;
const ROW_HEIGHT = 28;

/** Virtualized scrollable list of every opcode step in the trace.
 *  Auto-scrolls the current step into view; click a row to jump there.
 *  Self-contained: owns its own scroll state and ref. */
export function OpcodesTraceView({
  steps,
  currentStep,
  goTo,
  filteredIndices,
  maxDepth,
}: {
  steps: OpcodeStep[];
  currentStep: number;
  goTo: (step: number) => void;
  filteredIndices: number[] | null;
  maxDepth: number;
}) {
  const traceListRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalSteps = steps.length;
  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
  const visibleEnd = Math.min(totalSteps, visibleStart + VISIBLE_ROWS + 10);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Auto-scroll the current step into the middle of the viewport
  useEffect(() => {
    if (!traceListRef.current) return;
    const container = traceListRef.current;
    const targetScroll = currentStep * ROW_HEIGHT - container.clientHeight / 2 + ROW_HEIGHT / 2;
    container.scrollTop = Math.max(0, targetScroll);
  }, [currentStep]);

  return (
    <CollapsiblePanel title="Execution Trace" count={totalSteps} defaultOpen>
      <div
        ref={traceListRef}
        className="overflow-y-auto"
        onScroll={handleScroll}
        style={{ maxHeight: "400px" }}
      >
        <div style={{ height: totalSteps * ROW_HEIGHT, position: "relative" }}>
          {Array.from({ length: visibleEnd - visibleStart }, (_, i) => {
            const idx = visibleStart + i;
            const s = steps[idx]!;
            const isActive = idx === currentStep;
            const matchesFilter = !filteredIndices || filteredIndices.includes(idx);
            const depthFraction = maxDepth > 1 ? (s.depth - 1) / (maxDepth - 1) : 0;
            const depthHue = 260 - depthFraction * 200;
            return (
              <div
                key={idx}
                onClick={() => goTo(idx)}
                className="flex items-center cursor-pointer text-xs"
                style={{
                  position: "absolute",
                  top: idx * ROW_HEIGHT,
                  height: ROW_HEIGHT,
                  width: "100%",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: isActive ? "var(--color-accent-muted)" : "transparent",
                  borderLeft: isActive
                    ? "3px solid var(--color-accent)"
                    : `3px solid hsla(${depthHue}, 60%, 50%, ${s.depth > 1 ? 0.5 : 0})`,
                  opacity: matchesFilter ? 1 : 0.3,
                  paddingLeft: `${8 + (s.depth - 1) * 6}px`,
                  paddingRight: "12px",
                }}
              >
                <span className="w-14 text-right mr-3 flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
                  {idx}
                </span>
                <span className="w-10 text-right mr-3 flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
                  {s.pc}
                </span>
                <span className="w-28 font-semibold mr-3 flex-shrink-0" style={{ color: getOpcodeColor(s.op) }}>
                  {s.op}
                </span>
                <span
                  className="flex-shrink-0"
                  style={{ color: s.gasCost > 100 ? "var(--color-warning)" : "var(--color-text-muted)" }}
                >
                  {s.gasCost}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </CollapsiblePanel>
  );
}
