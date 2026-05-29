import { useCallback, useEffect, useRef, useState } from "react";
import { getOpcodeColor } from "@valve-tech/trace-sdk";
import type { OpcodeStep } from "../../../api/debugger";

const VISIBLE_ROWS = 30;
const ROW_HEIGHT = 28;

/**
 * Virtualized, height-filling opcode list. Fills its container so it can sit
 * beside the source pane in the synchronized debugger split. Auto-scrolls the
 * current step into the middle; click a row to jump there.
 */
export function OpcodeTracePane({
  steps,
  currentStep,
  goTo,
  filteredIndices,
  maxDepth,
}: {
  steps: OpcodeStep[];
  currentStep: number;
  goTo: (step: number) => void;
  filteredIndices: Set<number> | null;
  maxDepth: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalSteps = steps.length;
  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
  const visibleEnd = Math.min(totalSteps, visibleStart + VISIBLE_ROWS + 10);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Bring the active step into view when navigation moves it OUT of the
  // visible window — but leave scroll alone if it's already visible. Forcing
  // a recenter on every step would yank the list during arrow-stepping and
  // fight the user when they've scrolled ahead to look at upcoming opcodes.
  // The list is virtualized, so the active row may not exist in the DOM;
  // we compute its absolute position from currentStep * ROW_HEIGHT instead
  // of calling scrollIntoView.
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const rowTop = currentStep * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    if (rowTop < viewTop || rowBottom > viewBottom) {
      container.scrollTop = Math.max(0, rowTop - container.clientHeight / 2 + ROW_HEIGHT / 2);
    }
  }, [currentStep]);

  return (
    <div className="flex flex-col h-full">
      {/* Column header — without it the step-index and program-counter columns
          read like two unlabeled numbers and get mistaken for gas figures. */}
      <div
        className="flex items-center text-[10px] uppercase tracking-wider flex-shrink-0 bs-b-muted py-1"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", paddingLeft: 8, paddingRight: 12 }}
      >
        <span className="w-14 text-right mr-3 flex-shrink-0" title="Execution step index">Step</span>
        <span className="w-10 text-right mr-3 flex-shrink-0" title="Program counter — byte offset of this opcode within the contract's bytecode">Offset</span>
        <span className="w-28 mr-3 flex-shrink-0">Opcode</span>
        <span className="flex-shrink-0" title="Gas this opcode costs (not cumulative)">Gas cost</span>
      </div>

      <div ref={listRef} className="overflow-y-auto flex-1" onScroll={handleScroll}>
        <div style={{ height: totalSteps * ROW_HEIGHT, position: "relative" }}>
        {Array.from({ length: visibleEnd - visibleStart }, (_, i) => {
          const idx = visibleStart + i;
          const s = steps[idx]!;
          const isActive = idx === currentStep;
          const matchesFilter = !filteredIndices || filteredIndices.has(idx);
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
    </div>
  );
}
