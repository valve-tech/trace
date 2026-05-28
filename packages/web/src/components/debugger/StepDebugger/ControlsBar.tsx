import { isCallOp, isStorageOp, isLogOp } from "@valve-tech/trace-sdk/hooks";
import { ControlButton } from "./ControlButton";
import { Divider } from "./Divider";

type ContentView = "debugger" | "trace";

/** Top toolbar: nav buttons, jump-to-next-X buttons, opcode filter,
 *  Source/Slither toggles (when a contract is loaded), step slider, counter. */
export function ControlsBar({
  currentStep,
  totalSteps,
  goTo,
  jumpToStart,
  jumpToEnd,
  stepForward,
  stepBackward,
  jumpToNext,
  hasNext,
  opcodeFilter,
  setOpcodeFilter,
  filteredCount,
  contractAddress,
  contentView,
  setContentView,
  sourceLoading,
  handleAnalyze,
  slitherLoading,
  showFindings,
  slitherFindingsCount,
}: {
  currentStep: number;
  totalSteps: number;
  /** Raw setter used by the slider — does NOT push nav history. */
  goTo: (step: number) => void;
  /** Recording navigators — Home/End buttons go through these so the jump is
   *  reversible via Cmd+[ . */
  jumpToStart: () => void;
  jumpToEnd: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  jumpToNext: (predicate: (op: string) => boolean) => void;
  /** Whether a next CALL / SSTORE / LOG exists in the active frame from the
   *  cursor onward. Used to disable the corresponding buttons. */
  hasNext: { call: boolean; store: boolean; log: boolean };
  opcodeFilter: string;
  setOpcodeFilter: (v: string) => void;
  filteredCount: number | null;
  contractAddress?: string;
  contentView: ContentView;
  setContentView: (v: ContentView) => void;
  sourceLoading: boolean;
  handleAnalyze: () => void;
  slitherLoading: boolean;
  showFindings: boolean;
  slitherFindingsCount: number;
}) {
  return (
    // bg-card supplies the surface; bs-b draws ONE bottom border that
    // connects to the cards in the content row below (instead of stacking
    // two card borders separated by their margins).
    <div
      className="flex items-center gap-row px-4 py-2 bs-b"
      style={{ backgroundColor: "var(--color-bg-card)" }}
    >
      <div className="flex items-center gap-tight">
        <ControlButton label="|<" title="Jump to start (Home)" onClick={jumpToStart} />
        <ControlButton label="<" title="Step back (Left arrow)" onClick={stepBackward} />
        <ControlButton label=">" title="Step forward (Right arrow / Space)" onClick={stepForward} />
        <ControlButton label=">|" title="Jump to end (End)" onClick={jumpToEnd} />
      </div>

      <Divider />

      <div className="flex items-center gap-tight">
        <ControlButton label="CALL" title="Next CALL (C)" onClick={() => jumpToNext(isCallOp)} small accent disabled={!hasNext.call} />
        <ControlButton label="SSTORE" title="Next SSTORE (S)" onClick={() => jumpToNext(isStorageOp)} small accent disabled={!hasNext.store} />
        <ControlButton label="LOG" title="Next LOG (L)" onClick={() => jumpToNext(isLogOp)} small accent disabled={!hasNext.log} />
      </div>

      <Divider />

      <input
        type="text"
        placeholder="Filter..."
        value={opcodeFilter}
        onChange={(e) => setOpcodeFilter(e.target.value)}
        className="w-24 px-2 py-1 rounded text-xs"
        style={{
          backgroundColor: "var(--color-bg-input)",
          boxShadow: "0 0 0 1px var(--color-border-default)",
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-mono)",
        }}
      />
      {filteredCount !== null && (
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {filteredCount} matches
        </span>
      )}

      {contractAddress && (
        <>
          <Divider />
          <button
            onClick={() => setContentView("debugger")}
            className="rounded font-mono font-semibold transition-colors text-xs px-2 py-1"
            style={{
              backgroundColor: contentView === "debugger"
                ? "var(--color-accent)"
                : "var(--color-bg-secondary)",
              color: contentView === "debugger" ? "#fff" : "var(--color-text-primary)",
            }}
          >
            {sourceLoading ? "Loading..." : "Debugger"}
          </button>
          <button
            onClick={handleAnalyze}
            disabled={slitherLoading}
            className="rounded font-mono font-semibold transition-colors text-xs px-2 py-1"
            style={{
              backgroundColor: showFindings
                ? "var(--color-danger)"
                : "var(--color-bg-secondary)",
              color: showFindings ? "#fff" : "var(--color-text-primary)",
              boxShadow: "0 0 0 1px var(--color-border-default)",
              opacity: slitherLoading ? 0.5 : 1,
            }}
          >
            {slitherLoading ? "Analyzing..." : `Slither${slitherFindingsCount > 0 ? ` (${slitherFindingsCount})` : ""}`}
          </button>
        </>
      )}

      <Divider />

      <input
        type="range"
        min={0}
        max={totalSteps - 1}
        value={currentStep}
        onChange={(e) => goTo(Number(e.target.value))}
        className="flex-1"
        style={{ accentColor: "var(--color-accent)" }}
      />

      <span
        className="text-xs whitespace-nowrap"
        style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}
      >
        {(currentStep + 1).toLocaleString()} / {totalSteps.toLocaleString()}
      </span>
    </div>
  );
}
