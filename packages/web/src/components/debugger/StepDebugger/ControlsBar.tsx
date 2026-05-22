import { isCallOp, isStorageOp, isLogOp } from "@valve-tech/trace-sdk/hooks";
import { ControlButton } from "./ControlButton";
import { Divider } from "./Divider";

type ContentView = "trace" | "opcodes" | "source";

/** Top toolbar: nav buttons, jump-to-next-X buttons, opcode filter,
 *  Source/Slither toggles (when a contract is loaded), step slider, counter. */
export function ControlsBar({
  currentStep,
  totalSteps,
  goTo,
  stepForward,
  stepBackward,
  jumpToNext,
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
  goTo: (step: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  jumpToNext: (predicate: (op: string) => boolean) => void;
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
    <div
      className="flex items-center gap-3 px-4 py-2 card"
      style={{
        backgroundColor: "var(--color-bg-card)",
        boxShadow: "0 0 0 1px var(--color-border-default)",
      }}
    >
      <div className="flex items-center gap-1">
        <ControlButton label="|<" title="Jump to start (Home)" onClick={() => goTo(0)} />
        <ControlButton label="<" title="Step back (Left arrow)" onClick={stepBackward} />
        <ControlButton label=">" title="Step forward (Right arrow / Space)" onClick={stepForward} />
        <ControlButton label=">|" title="Jump to end (End)" onClick={() => goTo(totalSteps - 1)} />
      </div>

      <Divider />

      <div className="flex items-center gap-1">
        <ControlButton label="CALL" title="Next CALL (C)" onClick={() => jumpToNext(isCallOp)} small accent />
        <ControlButton label="SSTORE" title="Next SSTORE (S)" onClick={() => jumpToNext(isStorageOp)} small accent />
        <ControlButton label="LOG" title="Next LOG (L)" onClick={() => jumpToNext(isLogOp)} small accent />
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
            onClick={() => setContentView("source")}
            className="rounded font-mono font-semibold transition-colors text-xs px-2 py-1"
            style={{
              backgroundColor: contentView === "source"
                ? "var(--color-accent)"
                : "var(--color-bg-secondary)",
              color: contentView === "source" ? "#fff" : "var(--color-text-primary)",
            }}
          >
            {sourceLoading ? "Loading..." : "Source"}
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
