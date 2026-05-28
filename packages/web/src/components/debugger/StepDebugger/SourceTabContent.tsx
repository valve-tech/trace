import type { ContractSource, SlitherFinding } from "../../../api/source";
import SourceViewer, { type HighlightSpan } from "../SoliditySourceViewer";

type ContractSourceFile = ContractSource["files"][number];

/** Renders the Source tab pane: either the source viewer (when a verified
 *  source file is available) or a friendly fallback message. `maxHeight`
 *  defaults to a standalone-tab size; the synchronized split passes "100%"
 *  so the pane fills its half. */
export function SourceTabContent({
  currentSourceFile,
  effectiveLine,
  highlightSpan,
  scrollKey,
  slitherFindings,
  sourceLoading,
  activeContractAddress,
  maxHeight = "500px",
  onLineClick,
  onIdentifierClick,
  executableLines,
}: {
  currentSourceFile: ContractSourceFile | null;
  effectiveLine: number | null;
  highlightSpan: HighlightSpan | null;
  scrollKey: number;
  slitherFindings: SlitherFinding[];
  sourceLoading: boolean;
  activeContractAddress: string | null;
  maxHeight?: string;
  onLineClick?: (line: number) => void;
  onIdentifierClick?: (identifier: string, line: number) => void;
  executableLines?: Set<number>;
}) {
  if (currentSourceFile) {
    return (
      <div
        className="card overflow-hidden h-full"
        style={{
          backgroundColor: "var(--color-bg-card)",
          boxShadow: "0 0 0 1px var(--color-border-default)",
          maxHeight,
        }}
      >
        <SourceViewer
          file={currentSourceFile}
          currentLine={effectiveLine}
          highlightSpan={highlightSpan}
          scrollKey={scrollKey}
          onLineClick={onLineClick}
          onIdentifierClick={onIdentifierClick}
          executableLines={executableLines}
          findings={slitherFindings.flatMap((f) =>
            f.elements
              .filter((e) => e.sourceMapping?.lines?.length)
              .flatMap((e) =>
                (e.sourceMapping?.lines ?? []).map((line) => ({
                  line,
                  severity: f.impact,
                  message: `[${f.check}] ${f.description.split("\n")[0]}`,
                })),
              ),
          )}
        />
      </div>
    );
  }

  return (
    <div className="card p-8 text-center space-y-3">
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        {sourceLoading ? "Loading verified source..." : "No verified source available for this contract"}
      </p>
      {!sourceLoading && activeContractAddress && (
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {activeContractAddress.slice(0, 10)}...{activeContractAddress.slice(-6)} is not verified on BlockScout
        </p>
      )}
    </div>
  );
}
