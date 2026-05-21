import type { ContractSource, SlitherFinding } from "../../../api/source";
import SourceViewer from "../SoliditySourceViewer";

type ContractSourceFile = ContractSource["files"][number];

/** Renders the Source tab pane: either the source viewer (when a verified
 *  source file is available) or a friendly fallback message. */
export function SourceTabContent({
  currentSourceFile,
  effectiveLine,
  scrollKey,
  slitherFindings,
  sourceLoading,
  activeContractAddress,
}: {
  currentSourceFile: ContractSourceFile | null;
  effectiveLine: number | null;
  scrollKey: number;
  slitherFindings: SlitherFinding[];
  sourceLoading: boolean;
  activeContractAddress: string | null;
}) {
  if (currentSourceFile) {
    return (
      <div
        className="card overflow-hidden"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
          maxHeight: "500px",
        }}
      >
        <SourceViewer
          file={currentSourceFile}
          currentLine={effectiveLine}
          scrollKey={scrollKey}
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
