/**
 * Pure Solidity tokenizer used by SoliditySourceViewer. No React, no DOM —
 * a string in, an array of typed tokens out. Plus the span-splitting helper
 * that segments a tokenized line at an arbitrary character range so the
 * source viewer can highlight the exact sub-expression a current opcode
 * maps to.
 *
 * Extracted from SoliditySourceViewer.tsx to bring the orchestrator under
 * the project's 200-LOC soft ceiling and to make these pure helpers
 * directly testable without rendering React.
 */

// ---------------------------------------------------------------------------
// Token model
// ---------------------------------------------------------------------------

export type TokenType =
  | "keyword"
  | "type"
  | "number"
  | "string"
  | "comment"
  | "comment-tag"
  | "operator"
  | "punctuation"
  | "identifier"
  | "text";

export interface Token {
  type: TokenType;
  value: string;
}

export const SOLIDITY_KEYWORDS = new Set([
  "pragma", "solidity", "import", "contract", "interface", "library", "abstract",
  "function", "modifier", "event", "error", "struct", "enum", "mapping",
  "public", "private", "internal", "external", "view", "pure", "payable",
  "returns", "return", "if", "else", "for", "while", "do", "break", "continue",
  "require", "revert", "assert", "emit", "new", "delete", "is", "using",
  "memory", "storage", "calldata", "immutable", "constant", "override", "virtual",
  "constructor", "receive", "fallback", "try", "catch", "assembly", "unchecked",
]);

export const SOLIDITY_TYPES = new Set([
  "uint", "uint8", "uint16", "uint32", "uint64", "uint128", "uint256",
  "int", "int8", "int16", "int32", "int64", "int128", "int256",
  "bool", "address", "bytes", "bytes1", "bytes4", "bytes32", "string",
]);

export const TOKEN_COLORS: Record<TokenType, string> = {
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
// Highlight span — the exact character range the current opcode maps to.
// 1-indexed line+col, matching the backend's `offsetToLineCol`. Used by
// splitTokensBySpan to box the precise sub-expression executing.
// ---------------------------------------------------------------------------

export interface HighlightSpan {
  startLine: number;
  startCol: number; // 1-indexed; first highlighted char is at (startCol - 1)
  endLine: number;
  endCol: number; // 1-indexed exclusive end; last char is at (endCol - 2)
}

/** A token, possibly split so a sub-range can carry the span highlight. */
export interface RenderSegment {
  token: Token;
  highlighted: boolean;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize one line of Solidity source. Block-comment state crosses lines,
 * so callers walk the file sequentially passing the returned `inBlockComment`
 * into the next call's input.
 */
export function tokenizeLine(
  line: string,
  inBlockComment: boolean,
): { tokens: Token[]; inBlockComment: boolean } {
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

// ---------------------------------------------------------------------------
// NatSpec post-pass
// ---------------------------------------------------------------------------

const NATSPEC_TAG_RE = /@(dev|param|return|returns|notice|title|author|inheritdoc|custom)\b/g;

/**
 * Split a comment token so embedded NatSpec tags (@dev, @param, …) render
 * with their own color. Non-comment tokens pass through unchanged.
 */
export function splitCommentToken(token: Token): Token[] {
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
// Span splitting
// ---------------------------------------------------------------------------

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
