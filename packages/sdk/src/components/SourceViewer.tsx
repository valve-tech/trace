import { useEffect, useMemo, useRef, type CSSProperties } from "react";

export interface SourceViewerClassNames {
  root?: string;
  header?: string;
  body?: string;
  line?: string;
  highlightedLine?: string;
  gutter?: string;
  code?: string;
}

export interface SourceViewerProps {
  /** The full source text. Split on `\n` for line numbering. */
  source: string;
  /**
   * 1-indexed line to highlight (matches the convention used by Solidity
   * source maps and most code editors). Pass `null` or `undefined` for no
   * highlight. Out-of-range values are tolerated — the highlight simply
   * doesn't render.
   */
  highlightLine?: number | null;
  /**
   * Optional language label shown in the header. Purely decorative — there
   * is no client-side syntax highlighting (kept dependency-free).
   */
  language?: string;
  /** Optional file path or title for the header. */
  filename?: string;
  /** Hide the header strip entirely. */
  hideHeader?: boolean;
  /** Hide the line-number gutter. */
  hideLineNumbers?: boolean;
  /**
   * When the highlight line is set, scroll it into view on mount and on
   * subsequent `highlightLine` changes. Defaults to true.
   */
  scrollToHighlight?: boolean;
  /**
   * Max body height in px before the inner panel becomes scrollable.
   * Default 600.
   */
  maxHeight?: number;
  /** Per-slot class names for theming. */
  classNames?: SourceViewerClassNames;
  /** Inline style on the root element. */
  style?: CSSProperties;
  /** className on the root. */
  className?: string;
}

/**
 * Data-agnostic source-code viewer with line numbers and a single highlighted
 * line. Pairs with `StepDebugger` / `FrameDetailPanel` — pass the source text
 * resolved by a `SourceLocation` lookup, and the line to highlight.
 *
 * Intentionally dependency-free: no syntax highlighter, no editor library.
 * Consumers wanting tokenized output can wrap the `code` slot or layer
 * Prism/Shiki/Highlight.js on top.
 */
export function SourceViewer({
  source,
  highlightLine,
  language,
  filename,
  hideHeader = false,
  hideLineNumbers = false,
  scrollToHighlight = true,
  maxHeight = 600,
  classNames = {},
  style,
  className,
}: SourceViewerProps): React.JSX.Element {
  const lines = useMemo(() => source.split("\n"), [source]);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollToHighlight) return;
    if (highlightLine == null) return;
    const el = highlightRef.current;
    const body = bodyRef.current;
    if (!el || !body) return;
    // scrollIntoView is unavailable in jsdom; fall back to math + scrollTop so
    // both browsers and tests exercise the same path.
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "center", behavior: "auto" });
      return;
    }
    body.scrollTop = Math.max(
      0,
      el.offsetTop - body.clientHeight / 2 + el.clientHeight / 2,
    );
  }, [highlightLine, scrollToHighlight]);

  const gutterWidth = Math.max(2, lines.length.toString().length) * 8 + 16;
  const inHighlightRange =
    highlightLine != null && highlightLine >= 1 && highlightLine <= lines.length;

  return (
    <div
      className={[className, classNames.root].filter(Boolean).join(" ")}
      style={{
        borderRadius: 8,
        border: "1px solid rgba(139, 148, 158, 0.2)",
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
            gap: 12,
            padding: "10px 16px",
            borderBottom: "1px solid rgba(139, 148, 158, 0.2)",
            fontSize: 12,
          }}
        >
          <span style={{ fontWeight: 600, color: "#c9d1d9" }}>
            {filename ?? "Source"}
          </span>
          {language && (
            <span
              style={{
                padding: "1px 6px",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 500,
                color: "#8b949e",
                border: "1px solid rgba(139, 148, 158, 0.3)",
              }}
            >
              {language}
            </span>
          )}
          <span style={{ marginLeft: "auto", color: "#6e7681", fontSize: 11 }}>
            {lines.length.toLocaleString()}{" "}
            {lines.length === 1 ? "line" : "lines"}
            {inHighlightRange && ` — line ${highlightLine} highlighted`}
          </span>
        </div>
      )}

      <div
        ref={bodyRef}
        className={classNames.body}
        style={{
          overflow: "auto",
          maxHeight,
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: "18px",
        }}
      >
        {lines.map((text, i) => {
          const lineNumber = i + 1;
          const isHighlight = lineNumber === highlightLine;
          return (
            <div
              key={lineNumber}
              ref={isHighlight ? highlightRef : undefined}
              data-line={lineNumber}
              data-highlighted={isHighlight ? "true" : undefined}
              className={[
                classNames.line,
                isHighlight && classNames.highlightedLine,
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                display: "flex",
                whiteSpace: "pre",
                backgroundColor: isHighlight
                  ? "rgba(245, 158, 11, 0.13)"
                  : "transparent",
                borderLeft: isHighlight
                  ? "2px solid #f59e0b"
                  : "2px solid transparent",
              }}
            >
              {!hideLineNumbers && (
                <span
                  className={classNames.gutter}
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    width: gutterWidth,
                    paddingRight: 12,
                    textAlign: "right",
                    color: isHighlight ? "#f59e0b" : "#6e7681",
                    userSelect: "none",
                  }}
                >
                  {lineNumber}
                </span>
              )}
              <span
                className={classNames.code}
                style={{
                  color: isHighlight ? "#f0f6fc" : "#c9d1d9",
                  flex: 1,
                  paddingRight: 12,
                }}
              >
                {text.length === 0 ? "​" : text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
