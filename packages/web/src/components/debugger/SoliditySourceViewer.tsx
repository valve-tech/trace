import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { SourceFile } from "../../api/source";

// ---------------------------------------------------------------------------
// Syntax token types
// ---------------------------------------------------------------------------

type TokenType = "keyword" | "type" | "number" | "string" | "comment" | "comment-tag" | "operator" | "punctuation" | "identifier" | "text";

const SOLIDITY_KEYWORDS = new Set([
  "pragma", "solidity", "import", "contract", "interface", "library", "abstract",
  "function", "modifier", "event", "error", "struct", "enum", "mapping",
  "public", "private", "internal", "external", "view", "pure", "payable",
  "returns", "return", "if", "else", "for", "while", "do", "break", "continue",
  "require", "revert", "assert", "emit", "new", "delete", "is", "using",
  "memory", "storage", "calldata", "immutable", "constant", "override", "virtual",
  "constructor", "receive", "fallback", "try", "catch", "assembly", "unchecked",
]);

const SOLIDITY_TYPES = new Set([
  "uint", "uint8", "uint16", "uint32", "uint64", "uint128", "uint256",
  "int", "int8", "int16", "int32", "int64", "int128", "int256",
  "bool", "address", "bytes", "bytes1", "bytes4", "bytes32", "string",
]);

const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: "#C678DD",
  type: "#E5C07B",
  number: "#D19A66",
  string: "#98C379",
  comment: "#4B5263",
  "comment-tag": "#6B7394", // NatSpec tags — slightly brighter than comments
  operator: "#56B6C2",
  punctuation: "#636B7E",
  identifier: "#E06C75",
  text: "#ABB2BF",
};

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

interface Token {
  type: TokenType;
  value: string;
}

// ---------------------------------------------------------------------------
// Exact source-span highlighting
// ---------------------------------------------------------------------------

/**
 * The precise character range the current opcode maps to, derived from the
 * Solidity source map (1-indexed line/column, matching the backend's
 * `offsetToLineCol`). Lets us highlight the exact sub-expression executing —
 * e.g. just `amounts[0]` — instead of the whole line.
 */
export interface HighlightSpan {
  startLine: number;
  startCol: number; // 1-indexed; first highlighted char is at (startCol - 1)
  endLine: number;
  endCol: number; // 1-indexed exclusive end; last char is at (endCol - 2)
}

/** A token, possibly split so a sub-range can carry the span highlight. */
interface RenderSegment {
  token: Token;
  highlighted: boolean;
}

/**
 * Split a line's tokens into render segments, marking the characters that fall
 * inside the active span. A token straddling the span boundary is cut into
 * up to three pieces (before / inside / after) so the highlight lands on the
 * exact characters the compiler attributed to this opcode.
 */
export function splitTokensBySpan(
  tokens: Token[],
  lineNum: number,
  span: HighlightSpan | null,
): RenderSegment[] {
  if (!span || lineNum < span.startLine || lineNum > span.endLine) {
    return tokens.map((token) => ({ token, highlighted: false }));
  }

  // Per-line highlighted char range, in 0-based [start, end) coordinates.
  const lineStart = lineNum === span.startLine ? span.startCol - 1 : 0;
  const lineEnd = lineNum === span.endLine ? span.endCol - 1 : Infinity;

  const segments: RenderSegment[] = [];
  let col = 0;
  for (const token of tokens) {
    const tokStart = col;
    const tokEnd = col + token.value.length;
    col = tokEnd;

    const hiStart = Math.max(tokStart, lineStart);
    const hiEnd = Math.min(tokEnd, lineEnd);

    if (hiStart >= hiEnd) {
      segments.push({ token, highlighted: false });
      continue;
    }
    if (hiStart > tokStart) {
      segments.push({
        token: { type: token.type, value: token.value.slice(0, hiStart - tokStart) },
        highlighted: false,
      });
    }
    segments.push({
      token: { type: token.type, value: token.value.slice(hiStart - tokStart, hiEnd - tokStart) },
      highlighted: true,
    });
    if (hiEnd < tokEnd) {
      segments.push({
        token: { type: token.type, value: token.value.slice(hiEnd - tokStart) },
        highlighted: false,
      });
    }
  }
  return segments;
}

function tokenizeLine(line: string, inBlockComment: boolean): { tokens: Token[]; inBlockComment: boolean } {
  const tokens: Token[] = [];
  let i = 0;

  // If we're inside a /* */ block comment from a previous line
  if (inBlockComment) {
    const endIdx = line.indexOf("*/");
    if (endIdx === -1) {
      tokens.push({ type: "comment", value: line });
      return { tokens, inBlockComment: true };
    }
    tokens.push({ type: "comment", value: line.slice(0, endIdx + 2) });
    i = endIdx + 2;
    inBlockComment = false;
  }

  while (i < line.length) {
    if (/\s/.test(line[i]!)) {
      let j = i;
      while (j < line.length && /\s/.test(line[j]!)) j++;
      tokens.push({ type: "text", value: line.slice(i, j) });
      i = j;
      continue;
    }

    // Single-line comment
    if (line[i] === "/" && line[i + 1] === "/") {
      tokens.push({ type: "comment", value: line.slice(i) });
      return { tokens, inBlockComment: false };
    }

    // Block comment start
    if (line[i] === "/" && line[i + 1] === "*") {
      const endIdx = line.indexOf("*/", i + 2);
      if (endIdx === -1) {
        tokens.push({ type: "comment", value: line.slice(i) });
        return { tokens, inBlockComment: true };
      }
      tokens.push({ type: "comment", value: line.slice(i, endIdx + 2) });
      i = endIdx + 2;
      continue;
    }

    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i]!;
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === "\\") j++;
        j++;
      }
      tokens.push({ type: "string", value: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(line[i]!) || (line[i] === "0" && line[i + 1] === "x")) {
      let j = i;
      if (line[i] === "0" && line[i + 1] === "x") {
        j += 2;
        while (j < line.length && /[0-9a-fA-F_]/.test(line[j]!)) j++;
      } else {
        while (j < line.length && /[0-9_.]/.test(line[j]!)) j++;
      }
      tokens.push({ type: "number", value: line.slice(i, j) });
      i = j;
      continue;
    }

    if (/[a-zA-Z_$]/.test(line[i]!)) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j]!)) j++;
      const word = line.slice(i, j);
      let type: TokenType = "identifier";
      if (SOLIDITY_KEYWORDS.has(word)) type = "keyword";
      else if (SOLIDITY_TYPES.has(word)) type = "type";
      tokens.push({ type, value: word });
      i = j;
      continue;
    }

    if (/[=!<>+\-*/%&|^~?]/.test(line[i]!)) {
      let j = i + 1;
      if (j < line.length && /[=<>&|]/.test(line[j]!)) j++;
      tokens.push({ type: "operator", value: line.slice(i, j) });
      i = j;
      continue;
    }

    if (/[{}()[\];,.]/.test(line[i]!)) {
      tokens.push({ type: "punctuation", value: line[i]! });
      i++;
      continue;
    }

    tokens.push({ type: "text", value: line[i]! });
    i++;
  }

  return { tokens, inBlockComment };
}

const NATSPEC_TAG_RE = /@(dev|param|return|returns|notice|title|author|inheritdoc|custom)\b/g;

/** Split a comment token to highlight NatSpec tags */
function splitCommentToken(token: Token): Token[] {
  if (token.type !== "comment") return [token];
  const parts: Token[] = [];
  let lastIdx = 0;
  const val = token.value;
  NATSPEC_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = NATSPEC_TAG_RE.exec(val)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ type: "comment", value: val.slice(lastIdx, match.index) });
    }
    parts.push({ type: "comment-tag", value: match[0] });
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx === 0) return [token];
  if (lastIdx < val.length) {
    parts.push({ type: "comment", value: val.slice(lastIdx) });
  }
  return parts;
}

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
  const [selectedIdentifier, setSelectedIdentifier] = useState<string | null>(null);

  // Auto-scroll to current line — also triggers when file changes
  useEffect(() => {
    if (!containerRef.current || !currentLine) return;
    requestAnimationFrame(() => {
      const lineEl = containerRef.current?.querySelector(`[data-line="${currentLine}"]`);
      if (lineEl) {
        lineEl.scrollIntoView({ block: "center", behavior: "instant" });
      }
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

  // Find all occurrences of selected identifier for highlighting
  const identifierLines = useMemo(() => {
    if (!selectedIdentifier) return new Set<number>();
    const result = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
      const regex = new RegExp(`\\b${selectedIdentifier}\\b`);
      if (regex.test(lines[i]!)) result.add(i + 1);
    }
    return result;
  }, [selectedIdentifier, lines]);

  const handleTokenClick = useCallback(
    (token: Token, lineNum: number) => {
      if (token.type === "identifier") {
        setSelectedIdentifier((prev) => (prev === token.value ? null : token.value));
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
    <div
      ref={containerRef}
      className="overflow-auto text-xs"
      style={{ fontFamily: "var(--font-mono)", maxHeight: "100%" }}
    >
      {/* File name header */}
      <div
        className="sticky top-0 z-10 px-3 py-1.5 card-divider text-xs font-semibold"
        style={{ backgroundColor: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}
      >
        {file.name}
        {selectedIdentifier && (
          <span
            className="ml-3 px-2 py-0.5 cursor-pointer"
            style={{ backgroundColor: "var(--color-accent-muted)", color: "var(--color-accent)" }}
            onClick={() => setSelectedIdentifier(null)}
          >
            {selectedIdentifier} ({identifierLines.size} refs) ×
          </span>
        )}
      </div>

      {/* Source lines */}
      <div className="py-0">
        {lines.map((_line, i) => {
          const lineNum = i + 1;
          const isCurrentLine = lineNum === currentLine;
          const isHighlighted = highlightLines?.has(lineNum);
          const isIdentifierLine = identifierLines.has(lineNum);
          const lineFindings = findingsByLine.get(lineNum);
          const tokens = tokenizedLines[i] ?? [];

          return (
            <div
              key={lineNum}
              data-line={lineNum}
              className="flex"
              style={{
                backgroundColor: isCurrentLine
                  ? "rgba(139, 92, 246, 0.15)"
                  : isIdentifierLine
                    ? "rgba(224, 108, 117, 0.08)"
                    : isHighlighted
                      ? "rgba(139, 92, 246, 0.05)"
                      : "transparent",
                borderLeft: isCurrentLine
                  ? "3px solid var(--color-accent)"
                  : "3px solid transparent",
                minHeight: "20px",
              }}
            >
              {/* Gutter */}
              <span
                className="w-12 text-right pr-3 flex-shrink-0 select-none"
                style={{
                  color: isCurrentLine ? "var(--color-accent)" : "var(--color-text-muted)",
                  userSelect: "none",
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

              {/* Code with interactive tokens. Tokens are split by the active
                  span so the exact executing sub-expression can be boxed. */}
              <span className="flex-1 whitespace-pre" style={{ tabSize: 4 }}>
                {splitTokensBySpan(tokens, lineNum, highlightSpan ?? null).map(
                  ({ token, highlighted }, j) => {
                    const isClickable = token.type === "identifier";
                    const isSelected = selectedIdentifier === token.value && isClickable;

                    return (
                      <span
                        key={j}
                        onClick={isClickable ? () => handleTokenClick(token, lineNum) : undefined}
                        onMouseEnter={isClickable ? (e) => { e.currentTarget.style.textDecoration = "underline"; } : undefined}
                        onMouseLeave={isClickable ? (e) => { e.currentTarget.style.textDecoration = isSelected ? "underline" : "none"; } : undefined}
                        style={{
                          color: isSelected ? "var(--color-accent)" : TOKEN_COLORS[token.type],
                          fontWeight: isSelected || highlighted ? 700 : undefined,
                          textDecoration: isSelected ? "underline" : undefined,
                          textDecorationColor: isSelected ? "var(--color-accent)" : undefined,
                          cursor: isClickable ? "pointer" : undefined,
                          backgroundColor: highlighted ? "rgba(139, 92, 246, 0.35)" : undefined,
                          boxShadow: highlighted ? "0 0 0 1px rgba(139, 92, 246, 0.7)" : undefined,
                          borderRadius: highlighted ? "2px" : undefined,
                        }}
                      >
                        {token.value}
                      </span>
                    );
                  },
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
