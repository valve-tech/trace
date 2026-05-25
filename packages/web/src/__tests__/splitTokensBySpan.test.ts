import { describe, it, expect } from "vitest";
import {
  splitTokensBySpan,
  type HighlightSpan,
} from "../components/debugger/SoliditySourceViewer";

// Reconstruct the original line text from segments so we can assert that
// splitting never drops or reorders characters — only annotates them.
function text(segs: { token: { value: string } }[]): string {
  return segs.map((s) => s.token.value).join("");
}
function highlightedText(segs: { token: { value: string }; highlighted: boolean }[]): string {
  return segs
    .filter((s) => s.highlighted)
    .map((s) => s.token.value)
    .join("");
}

const LINE = [
  { type: "text" as const, value: "    " },
  { type: "identifier" as const, value: "amounts" },
  { type: "punctuation" as const, value: "[" },
  { type: "number" as const, value: "0" },
  { type: "punctuation" as const, value: "]" },
  { type: "punctuation" as const, value: ";" },
];
// columns (1-indexed): "    amounts[0];"  → 'a' starts at col 5, '[' at col 12.

describe("splitTokensBySpan", () => {
  it("returns all-unhighlighted when there is no span", () => {
    const segs = splitTokensBySpan(LINE, 10, null);
    expect(highlightedText(segs)).toBe("");
    expect(text(segs)).toBe("    amounts[0];");
  });

  it("returns all-unhighlighted when the line is outside the span range", () => {
    const span: HighlightSpan = { startLine: 20, startCol: 1, endLine: 22, endCol: 5 };
    const segs = splitTokensBySpan(LINE, 10, span);
    expect(highlightedText(segs)).toBe("");
  });

  it("highlights an exact sub-expression spanning whole tokens", () => {
    // Highlight "amounts" — col 5..12 (exclusive end).
    const span: HighlightSpan = { startLine: 10, startCol: 5, endLine: 10, endCol: 12 };
    const segs = splitTokensBySpan(LINE, 10, span);
    expect(highlightedText(segs)).toBe("amounts");
    expect(text(segs)).toBe("    amounts[0];");
  });

  it("splits a token when the span starts mid-token", () => {
    // Line: "    amounts[0];" — 'a' at col 5, so col 8 = 'u' (index 7).
    // endCol 14 is exclusive → last highlighted char is index 12 ('0').
    const span: HighlightSpan = { startLine: 10, startCol: 8, endLine: 10, endCol: 14 };
    const segs = splitTokensBySpan(LINE, 10, span);
    expect(highlightedText(segs)).toBe("unts[0");
    // No characters are dropped — only annotated.
    expect(text(segs)).toBe("    amounts[0];");
    const unhighlighted = segs.filter((s) => !s.highlighted).map((s) => s.token.value).join("");
    expect(unhighlighted).toBe("    amo];");
  });

  it("highlights start-line from startCol to EOL on a multi-line span", () => {
    // Multi-line span begins at col 12 ('[') on this start line → to end of line.
    const span: HighlightSpan = { startLine: 10, startCol: 12, endLine: 11, endCol: 3 };
    const segs = splitTokensBySpan(LINE, 10, span);
    expect(highlightedText(segs)).toBe("[0];");
  });

  it("highlights end-line from start to endCol on a multi-line span", () => {
    const span: HighlightSpan = { startLine: 9, startCol: 1, endLine: 10, endCol: 5 };
    const segs = splitTokensBySpan(LINE, 10, span);
    // endCol 5 (exclusive) → chars 0..4 = the four leading spaces.
    expect(highlightedText(segs)).toBe("    ");
  });

  it("highlights a full middle line of a multi-line span", () => {
    const span: HighlightSpan = { startLine: 9, startCol: 1, endLine: 11, endCol: 1 };
    const segs = splitTokensBySpan(LINE, 10, span);
    expect(highlightedText(segs)).toBe("    amounts[0];");
  });
});
