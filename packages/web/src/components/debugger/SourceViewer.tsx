import { useRef, useEffect, useMemo } from "react";
import type { SourceFile } from "../../api/source";

// ---------------------------------------------------------------------------
// Syntax token types for basic Solidity highlighting
// ---------------------------------------------------------------------------

type TokenType = "keyword" | "type" | "number" | "string" | "comment" | "operator" | "punctuation" | "text";

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
  "uint256[]", "address[]", "bytes32[]",
]);

const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: "#C678DD",
  type: "#E5C07B",
  number: "#D19A66",
  string: "#98C379",
  comment: "#5C6370",
  operator: "#56B6C2",
  punctuation: "#ABB2BF",
  text: "#ABB2BF",
};

// ---------------------------------------------------------------------------
// Simple tokenizer (line-by-line, not a full parser)
// ---------------------------------------------------------------------------

interface Token {
  type: TokenType;
  value: string;
}

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Skip whitespace
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
      break;
    }

    // String literal
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i]!;
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === "\\") j++; // skip escaped char
        j++;
      }
      tokens.push({ type: "string", value: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // Number (hex or decimal)
    if (/[0-9]/.test(line[i]!) || (line[i] === "0" && line[i + 1] === "x")) {
      let j = i;
      if (line[i] === "0" && line[i + 1] === "x") {
        j += 2;
        while (j < line.length && /[0-9a-fA-F_]/.test(line[j]!)) j++;
      } else {
        while (j < line.length && /[0-9_.]/.test(line[j]!)) j++;
        if (j < line.length && /[eE]/.test(line[j]!)) {
          j++;
          if (j < line.length && /[+-]/.test(line[j]!)) j++;
          while (j < line.length && /[0-9]/.test(line[j]!)) j++;
        }
      }
      tokens.push({ type: "number", value: line.slice(i, j) });
      i = j;
      continue;
    }

    // Word (identifier/keyword/type)
    if (/[a-zA-Z_$]/.test(line[i]!)) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j]!)) j++;
      const word = line.slice(i, j);
      let type: TokenType = "text";
      if (SOLIDITY_KEYWORDS.has(word)) type = "keyword";
      else if (SOLIDITY_TYPES.has(word)) type = "type";
      tokens.push({ type, value: word });
      i = j;
      continue;
    }

    // Operators and punctuation
    if (/[=!<>+\-*/%&|^~?]/.test(line[i]!)) {
      let j = i + 1;
      // Handle multi-char operators
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

    // Fallback: single character
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
  highlightLines?: Set<number>;
  findings?: Array<{ line: number; severity: string; message: string }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SourceViewer({
  file,
  currentLine,
  highlightLines,
  findings,
}: SourceViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => file.content.split("\n"), [file.content]);

  // Auto-scroll to current line
  useEffect(() => {
    if (!containerRef.current || !currentLine) return;
    const lineEl = containerRef.current.querySelector(`[data-line="${currentLine}"]`);
    if (lineEl) {
      lineEl.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [currentLine]);

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
      style={{
        fontFamily: "var(--font-mono)",
        maxHeight: "100%",
      }}
    >
      {/* File name header */}
      <div
        className="sticky top-0 z-10 px-3 py-1.5 border-b text-xs font-semibold"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border-default)",
          color: "var(--color-text-secondary)",
        }}
      >
        {file.name}
      </div>

      {/* Source lines */}
      <div className="py-1">
        {lines.map((line, i) => {
          const lineNum = i + 1;
          const isCurrentLine = lineNum === currentLine;
          const isHighlighted = highlightLines?.has(lineNum);
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
                  : isHighlighted
                    ? "rgba(139, 92, 246, 0.05)"
                    : "transparent",
                borderLeft: isCurrentLine
                  ? "3px solid var(--color-accent)"
                  : "3px solid transparent",
                minHeight: "20px",
              }}
            >
              {/* Gutter: line number + finding marker */}
              <span
                className="w-12 text-right pr-3 flex-shrink-0 select-none"
                style={{
                  color: isCurrentLine
                    ? "var(--color-accent)"
                    : "var(--color-text-muted)",
                  userSelect: "none",
                }}
              >
                {lineFindings && (
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1"
                    title={lineFindings.map((f) => `[${f.severity}] ${f.message}`).join("\n")}
                    style={{
                      backgroundColor: severityColors[lineFindings[0]?.severity ?? ""] ?? "#60A5FA",
                    }}
                  />
                )}
                {lineNum}
              </span>

              {/* Code */}
              <span className="flex-1 whitespace-pre" style={{ tabSize: 4 }}>
                {tokens.map((token, j) => (
                  <span key={j} style={{ color: TOKEN_COLORS[token.type] }}>
                    {token.value}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
