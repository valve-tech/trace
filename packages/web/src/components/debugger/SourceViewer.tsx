import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { SourceFile } from "../../api/source";

// ---------------------------------------------------------------------------
// Syntax token types
// ---------------------------------------------------------------------------

type TokenType = "keyword" | "type" | "number" | "string" | "comment" | "operator" | "punctuation" | "identifier" | "text";

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
  comment: "#5C6370",
  operator: "#56B6C2",
  punctuation: "#ABB2BF",
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

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    if (/\s/.test(line[i]!)) {
      let j = i;
      while (j < line.length && /\s/.test(line[j]!)) j++;
      tokens.push({ type: "text", value: line.slice(i, j) });
      i = j;
      continue;
    }

    if (line[i] === "/" && line[i + 1] === "/") {
      tokens.push({ type: "comment", value: line.slice(i) });
      break;
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

    if (/[{}()\[\];,.]/.test(line[i]!)) {
      tokens.push({ type: "punctuation", value: line[i]! });
      i++;
      continue;
    }

    tokens.push({ type: "text", value: line[i]! });
    i++;
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SourceViewerProps {
  file: SourceFile;
  currentLine: number | null;
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
  scrollKey,
  highlightLines,
  findings,
  onIdentifierClick,
}: SourceViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => file.content.split("\n"), [file.content]);
  const [selectedIdentifier, setSelectedIdentifier] = useState<string | null>(null);

  // Auto-scroll to current line — also triggers when file changes
  useEffect(() => {
    if (!containerRef.current || !currentLine) return;
    // Small delay to let DOM render after file switch
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
        {lines.map((line, i) => {
          const lineNum = i + 1;
          const isCurrentLine = lineNum === currentLine;
          const isHighlighted = highlightLines?.has(lineNum);
          const isIdentifierLine = identifierLines.has(lineNum);
          const lineFindings = findingsByLine.get(lineNum);
          const tokens = tokenizeLine(line);

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

              {/* Code with interactive tokens */}
              <span className="flex-1 whitespace-pre" style={{ tabSize: 4 }}>
                {tokens.map((token, j) => {
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
                        fontWeight: isSelected ? 700 : undefined,
                        textDecoration: isSelected ? "underline" : undefined,
                        textDecorationColor: isSelected ? "var(--color-accent)" : undefined,
                        cursor: isClickable ? "pointer" : undefined,
                      }}
                    >
                      {token.value}
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
