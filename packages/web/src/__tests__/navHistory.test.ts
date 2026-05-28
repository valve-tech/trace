import { describe, it, expect } from "vitest";
import {
  emptyHistory,
  pushEntry,
  goBack,
  goForward,
  canGoBack,
  canGoForward,
  currentEntry,
} from "../components/debugger/StepDebugger/navHistory";

const e = (step: number, overrideLine: number | null = null) => ({ step, overrideLine });

describe("navHistory", () => {
  it("starts empty with no current entry and can't go back/forward", () => {
    expect(currentEntry(emptyHistory)).toBeNull();
    expect(canGoBack(emptyHistory)).toBe(false);
    expect(canGoForward(emptyHistory)).toBe(false);
  });

  it("pushEntry appends and advances the index", () => {
    const s1 = pushEntry(emptyHistory, e(10));
    expect(s1.entries).toEqual([e(10)]);
    expect(s1.index).toBe(0);
    expect(currentEntry(s1)).toEqual(e(10));
  });

  it("pushEntry is idempotent for identical consecutive entries", () => {
    const s1 = pushEntry(emptyHistory, e(10));
    const s2 = pushEntry(s1, e(10));
    expect(s2).toBe(s1); // identity preserved
  });

  it("pushEntry differentiates on overrideLine (same step, different line)", () => {
    const s1 = pushEntry(emptyHistory, e(10, null));
    const s2 = pushEntry(s1, e(10, 42));
    expect(s2.entries.length).toBe(2);
  });

  it("goBack moves toward the start; goForward moves toward the end", () => {
    let s = emptyHistory;
    s = pushEntry(s, e(10));
    s = pushEntry(s, e(20));
    s = pushEntry(s, e(30));
    expect(s.index).toBe(2);

    s = goBack(s);
    expect(currentEntry(s)).toEqual(e(20));
    s = goBack(s);
    expect(currentEntry(s)).toEqual(e(10));
    expect(canGoBack(s)).toBe(false);
    // no-op at start
    expect(goBack(s)).toBe(s);

    s = goForward(s);
    expect(currentEntry(s)).toEqual(e(20));
    s = goForward(s);
    expect(currentEntry(s)).toEqual(e(30));
    expect(canGoForward(s)).toBe(false);
    // no-op at end
    expect(goForward(s)).toBe(s);
  });

  it("pushing after going back truncates the forward history (browser model)", () => {
    let s = emptyHistory;
    s = pushEntry(s, e(10));
    s = pushEntry(s, e(20));
    s = pushEntry(s, e(30));
    s = goBack(s); // at index 1, entry e(20)
    s = goBack(s); // at index 0, entry e(10)
    s = pushEntry(s, e(50)); // truncates e(20), e(30)
    expect(s.entries).toEqual([e(10), e(50)]);
    expect(s.index).toBe(1);
    expect(canGoForward(s)).toBe(false);
  });
});
