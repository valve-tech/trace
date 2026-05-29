import { useEffect, useMemo, useRef, useState } from "react";
import type { ContractSource, SlitherFinding } from "../../../api/source";
import SourceViewer, { type HighlightSpan } from "../SoliditySourceViewer";

type ContractSourceFile = ContractSource["files"][number];

/** Strip path prefix from a flattened import name — e.g.
 *  `@openzeppelin/contracts/token/ERC20/ERC20.sol` → `ERC20.sol`. The full
 *  path stays in the tab's title tooltip so users can disambiguate when two
 *  imports share a basename. */
function basename(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return slash >= 0 ? path.slice(slash + 1) : path;
}

/** Renders the Source tab pane: either the source viewer (when a verified
 *  source file is available) or a friendly fallback message. `maxHeight`
 *  defaults to a standalone-tab size; the synchronized split passes "100%"
 *  so the pane fills its half.
 *
 *  Tabs across the top let the user manually pick any file in the contract's
 *  source tree — useful for reading imports/libraries when the cursor isn't
 *  there yet. The auto-selected file (from the cursor's source map) is the
 *  default; manual selection sticks until the contract changes. */
export function SourceTabContent({
  currentSourceFile,
  allFiles,
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
  /** Auto-selected from the cursor's source map; null when no source is loaded. */
  currentSourceFile: ContractSourceFile | null;
  /** Every source file in the active contract. Surface via the tab strip. */
  allFiles: ContractSourceFile[];
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
  // Flatten Slither's nested findings/elements/lines structure into the
  // per-line shape the viewer indexes. Memoized so it doesn't get rebuilt on
  // every step — without this, the viewer's findingsByLine useMemo would see
  // a new array reference each render and rebuild its Map on every cursor move.
  const sourceViewerFindings = useMemo(
    () =>
      slitherFindings.flatMap((f) =>
        f.elements
          .filter((e) => e.sourceMapping?.lines?.length)
          .flatMap((e) =>
            (e.sourceMapping?.lines ?? []).map((line) => ({
              line,
              severity: f.impact,
              message: `[${f.check}] ${f.description.split("\n")[0]}`,
            })),
          ),
      ),
    [slitherFindings],
  );

  // Manual file override: when the user clicks a tab, we show that file even
  // if the cursor is mapped elsewhere. Resets whenever the active contract
  // changes (different sourcesByAddr → different file set), so navigating
  // to a new contract starts fresh.
  const [manualFile, setManualFile] = useState<string | null>(null);
  useEffect(() => {
    setManualFile(null);
  }, [activeContractAddress]);

  const displayedFile = useMemo(() => {
    if (manualFile) {
      return allFiles.find((f) => f.name === manualFile) ?? currentSourceFile;
    }
    return currentSourceFile;
  }, [manualFile, allFiles, currentSourceFile]);

  // The cursor's source-map line only applies to the auto-selected file.
  // When the user is reading another file, hide the line indicator so we
  // don't paint a misleading highlight.
  const isViewingActiveFile =
    !!displayedFile && !!currentSourceFile && displayedFile.name === currentSourceFile.name;

  // Auto-scroll the active tab into view when the cursor crosses files
  // (e.g. stepping into a library). Without this, the strip stays scrolled
  // wherever the user last touched it and the new active tab might be
  // off-screen.
  const tabStripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!currentSourceFile) return;
    const el = tabStripRef.current?.querySelector(
      `[data-file-tab="${CSS.escape(currentSourceFile.name)}"]`,
    );
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentSourceFile]);

  if (displayedFile) {
    return (
      <div
        className="card overflow-hidden h-full flex flex-col"
        style={{
          backgroundColor: "var(--color-bg-card)",
          boxShadow: "0 0 0 1px var(--color-border-default)",
          maxHeight,
        }}
      >
        {allFiles.length > 1 && (
          <div
            ref={tabStripRef}
            className="flex overflow-x-auto flex-shrink-0"
            style={{
              boxShadow: "0 1px 0 0 var(--color-border-default)",
              backgroundColor: "var(--color-bg-secondary)",
            }}
          >
            {allFiles.map((f) => {
              const isDisplayed = displayedFile.name === f.name;
              const isActive = currentSourceFile?.name === f.name;
              return (
                <button
                  key={f.name}
                  data-file-tab={f.name}
                  onClick={() => setManualFile(f.name === currentSourceFile?.name ? null : f.name)}
                  title={f.name}
                  className="px-3 py-1.5 text-[11px] whitespace-nowrap transition-colors flex-shrink-0"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: isDisplayed
                      ? "var(--color-text-primary)"
                      : "var(--color-text-muted)",
                    backgroundColor: isDisplayed
                      ? "var(--color-bg-card)"
                      : "transparent",
                    boxShadow: isDisplayed
                      ? "inset 0 2px 0 0 var(--color-accent)"
                      : undefined,
                    cursor: "pointer",
                  }}
                >
                  {/* Bullet marks the cursor's current file when it's not the
                      file the user is viewing — so they can spot where
                      execution actually is at a glance. */}
                  {isActive && !isDisplayed && (
                    <span style={{ color: "var(--color-accent)", marginRight: 4 }}>●</span>
                  )}
                  {basename(f.name)}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex-1 min-h-0">
          <SourceViewer
            file={displayedFile}
            currentLine={isViewingActiveFile ? effectiveLine : null}
            highlightSpan={isViewingActiveFile ? highlightSpan : null}
            scrollKey={scrollKey}
            onLineClick={onLineClick}
            onIdentifierClick={onIdentifierClick}
            executableLines={isViewingActiveFile ? executableLines : undefined}
            findings={sourceViewerFindings}
          />
        </div>
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
