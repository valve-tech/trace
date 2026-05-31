import { useRef, useEffect, useMemo, useCallback, type ReactNode } from "react";
import type { SourceFile } from "../../api/source";
import {
  type Token,
  type HighlightSpan,
  TOKEN_COLORS,
  tokenizeLine,
  splitCommentToken,
  splitTokensBySpan,
} from "./SoliditySourceViewer/tokenize";
import { useFindInSource } from "./SoliditySourceViewer/useFindInSource";
import { FindBar } from "./SoliditySourceViewer/FindBar";

// Re-export `HighlightSpan` and `splitTokensBySpan` so existing importers
// (SourceTabContent, SourceOpcodeSplit, the splitTokensBySpan unit test)
// keep working without touching their import paths.
export { type HighlightSpan, splitTokensBySpan };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SourceViewerProps {
  file: SourceFile;
  currentLine: number | null;
  /** Exact character span the current opcode maps to. When present, the
   *  precise sub-expression is boxed; the line still gets the soft accent. */
  highlightSpan?: HighlightSpan | null;
  scrollKey?: number; // increment to force re-scroll even if currentLine hasn't changed
  highlightLines?: Set<number>;
  findings?: Array<{ line: number; severity: string; message: string }>;
  onIdentifierClick?: (identifier: string, line: number) => void;
  /** Click the line-number gutter to act on a line (e.g. jump to the first
   *  opcode mapped there). Lines with no executing opcode get a dimmed gutter. */
  onLineClick?: (line: number) => void;
  /** Lines that have at least one opcode mapped to them — used to indicate
   *  which gutter numbers are clickable jump targets. */
  executableLines?: Set<number>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SourceViewer({
  file,
  currentLine,
  highlightSpan,
  scrollKey,
  highlightLines,
  findings,
  onIdentifierClick,
  onLineClick,
  executableLines,
}: SourceViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => file.content.split("\n"), [file.content]);

  // Pre-tokenize all lines with block comment tracking
  const tokenizedLines = useMemo(() => {
    let inComment = false;
    return lines.map((line) => {
      const result = tokenizeLine(line, inComment);
      inComment = result.inBlockComment;
      // Split comment tokens to highlight NatSpec tags
      return result.tokens.flatMap(splitCommentToken);
    });
  }, [lines]);
  // Identifier clicks used to toggle a self-contained filter+badge. They now
  // fire onIdentifierClick so the parent can navigate to the definition; the
  // selected/highlight UI state lives there, not here.

  // In-pane find (Cmd/Ctrl+F). Hook owns all state, the keyboard
  // interceptor, the activeMatch clamp, and the scroll-to-active effect.
  const {
    open: findOpen,
    query: findQuery,
    setQuery: setFindQuery,
    activeMatch,
    matchLines,
    matchSet,
    activeMatchLine,
    stepMatch,
    closeFind,
    inputRef: findInputRef,
  } = useFindInSource(lines, containerRef);

  // Auto-scroll to current line — `block: "nearest"` so manual scroll is
  // preserved when the line is already on screen. Without this, stepping
  // through opcodes that happen to cross a source-line boundary forced a
  // recenter on every transition, fighting the user when they had scrolled
  // ahead to read upcoming code. Explicit jumps (scrollKey bump) may land
  // the cursor at the edge rather than the center, but it stays visible.
  useEffect(() => {
    if (!containerRef.current || !currentLine) return;
    requestAnimationFrame(() => {
      const lineEl = containerRef.current?.querySelector(`[data-line="${currentLine}"]`);
      lineEl?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  }, [currentLine, file.name, scrollKey]);

  // Build findings lookup
  const findingsByLine = useMemo(() => {
    if (!findings) return new Map<number, Array<{ severity: string; message: string }>>();
    const map = new Map<number, Array<{ severity: string; message: string }>>();
    for (const f of findings) {
      const existing = map.get(f.line) ?? [];
      existing.push({ severity: f.severity, message: f.message });
      map.set(f.line, existing);
    }
    return map;
  }, [findings]);

  const handleTokenClick = useCallback(
    (token: Token, lineNum: number) => {
      if (token.type === "identifier") {
        onIdentifierClick?.(token.value, lineNum);
      }
    },
    [onIdentifierClick],
  );

  const severityColors: Record<string, string> = {
    High: "var(--color-danger)",
    Medium: "#F59E0B",
    Low: "#EAB308",
    Informational: "#60A5FA",
  };

  return (
    <div className="relative h-full">
      {findOpen && (
        <FindBar
          inputRef={findInputRef}
          query={findQuery}
          onQueryChange={setFindQuery}
          activeMatch={activeMatch}
          matchCount={matchLines.length}
          onStep={stepMatch}
          onClose={closeFind}
        />
      )}
      <div
        ref={containerRef}
        className="overflow-auto text-xs h-full theme-mono"
        style={{ maxHeight: "100%" }}
      >
      {/* File name header */}
      <div className="sticky top-0 z-10 px-3 py-1.5 card-divider text-xs font-semibold theme-secondary-bg theme-text-secondary">
        {file.name}
      </div>

      {/* Source lines */}
      <div className="py-0">
        {lines.map((_line, i) => {
          const lineNum = i + 1;
          const isCurrentLine = lineNum === currentLine;
          const isHighlighted = highlightLines?.has(lineNum);
          const isFindMatch = matchSet.has(lineNum);
          const isActiveFind = findOpen && lineNum === activeMatchLine;
          const lineFindings = findingsByLine.get(lineNum);
          const tokens = tokenizedLines[i] ?? [];

          return (
            <div
              key={lineNum}
              data-line={lineNum}
              className="flex"
              style={{
                backgroundColor: isActiveFind
                  ? "rgba(210, 153, 34, 0.35)"
                  : isFindMatch
                    ? "rgba(210, 153, 34, 0.15)"
                    : isCurrentLine
                      ? "rgba(139, 92, 246, 0.15)"
                      : isHighlighted
                        ? "rgba(139, 92, 246, 0.05)"
                        : "transparent",
                borderLeft: isActiveFind
                  ? "3px solid var(--color-warning)"
                  : isCurrentLine
                    ? "3px solid var(--color-accent)"
                    : "3px solid transparent",
                minHeight: "20px",
              }}
            >
              {/* Gutter — clickable when the line has an opcode to jump to */}
              {(() => {
                const isExecutable = executableLines?.has(lineNum) ?? false;
                const clickable = !!onLineClick && isExecutable;
                return (
              <span
                onClick={clickable ? () => onLineClick(lineNum) : undefined}
                title={clickable ? `Jump to first opcode on line ${lineNum}` : undefined}
                className="w-12 text-right pr-3 flex-shrink-0 select-none"
                style={{
                  color: isCurrentLine
                    ? "var(--color-accent)"
                    : isExecutable
                      ? "var(--color-text-secondary)"
                      : "var(--color-text-muted)",
                  userSelect: "none",
                  cursor: clickable ? "pointer" : undefined,
                }}
              >
                {lineFindings && (
                  <span
                    className="inline-block w-2 h-2 mr-1"
                    title={lineFindings.map((f) => `[${f.severity}] ${f.message}`).join("\n")}
                    style={{ backgroundColor: severityColors[lineFindings[0]?.severity ?? ""] ?? "#60A5FA" }}
                  />
                )}
                {lineNum}
              </span>
                );
              })()}

              {/* Code with interactive tokens. Tokens are split by the active
                  span so the exact executing sub-expression can be boxed.
                  Adjacent highlighted segments are wrapped in ONE run-container
                  so the box reads as a single continuous region instead of N
                  abutting rounded boxes — see runs-grouping below. */}
              <span className="flex-1 whitespace-pre" style={{ tabSize: 4 }}>
                {(() => {
                  const segs = splitTokensBySpan(tokens, lineNum, highlightSpan ?? null);
                  const renderToken = (
                    { token }: { token: Token },
                    j: number,
                    highlighted: boolean,
                  ) => {
                    const isClickable = token.type === "identifier";
                    return (
                      <span
                        key={j}
                        onClick={isClickable ? () => handleTokenClick(token, lineNum) : undefined}
                        onMouseEnter={isClickable ? (e) => { e.currentTarget.style.textDecoration = "underline"; } : undefined}
                        onMouseLeave={isClickable ? (e) => { e.currentTarget.style.textDecoration = "none"; } : undefined}
                        style={{
                          color: TOKEN_COLORS[token.type],
                          fontWeight: highlighted ? 700 : undefined,
                          cursor: isClickable ? "pointer" : undefined,
                        }}
                      >
                        {token.value}
                      </span>
                    );
                  };

                  // Walk segments, grouping consecutive `highlighted: true` ones
                  // into a run that shares one box. Non-highlighted segments
                  // emit individually with no wrapper.
                  const out: ReactNode[] = [];
                  let i = 0;
                  let runIdx = 0;
                  while (i < segs.length) {
                    if (!segs[i]!.highlighted) {
                      out.push(renderToken(segs[i]!, i, false));
                      i++;
                      continue;
                    }
                    const start = i;
                    while (i < segs.length && segs[i]!.highlighted) i++;
                    const run = segs.slice(start, i);
                    out.push(
                      <span
                        key={`run-${runIdx++}`}
                        style={{
                          backgroundColor: "rgba(139, 92, 246, 0.35)",
                          boxShadow: "0 0 0 1px rgba(139, 92, 246, 0.7)",
                          borderRadius: "2px",
                        }}
                      >
                        {run.map((seg, j) => renderToken(seg, start + j, true))}
                      </span>,
                    );
                  }
                  return out;
                })()}
              </span>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
