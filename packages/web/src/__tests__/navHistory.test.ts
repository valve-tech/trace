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
const INITIAL = e(0, null);

describe("navHistory", () => {
  it("starts empty with no current entry and can't go back/forward", () => {
    expect(currentEntry(emptyHistory)).toBeNull();
    expect(canGoBack(emptyHistory)).toBe(false);
    expect(canGoForward(emptyHistory)).toBe(false);
  });

  it("first push seeds the implicit initial entry, then appends", () => {
    const s1 = pushEntry(emptyHistory, e(10));
    // Browser model: opening a tab gives you a blank page in history,
    // so the first navigation has somewhere to go back to.
    expect(s1.entries).toEqual([INITIAL, e(10)]);
    expect(s1.index).toBe(1);
    expect(currentEntry(s1)).toEqual(e(10));
    expect(canGoBack(s1)).toBe(true);
  });

  it("first push of the initial entry itself does NOT duplicate the seed", () => {
    // If the very first nav happens to land at step 0 with no override
    // (e.g. user immediately presses Home), the seed and the entry coincide.
    const s1 = pushEntry(emptyHistory, INITIAL);
    expect(s1.entries).toEqual([INITIAL]);
    expect(s1.index).toBe(0);
    expect(canGoBack(s1)).toBe(false);
  });

  it("pushEntry is idempotent for identical consecutive entries", () => {
    const s1 = pushEntry(emptyHistory, e(10));
    const s2 = pushEntry(s1, e(10));
    expect(s2).toBe(s1); // identity preserved
  });

  it("pushEntry differentiates on overrideLine (same step, different line)", () => {
    const s1 = pushEntry(emptyHistory, e(10, null));
    const s2 = pushEntry(s1, e(10, 42));
    // [INITIAL, e(10, null), e(10, 42)]
    expect(s2.entries.length).toBe(3);
  });

  it("goBack walks back through user nav and lands at the implicit initial entry", () => {
    let s = emptyHistory;
    s = pushEntry(s, e(10));
    s = pushEntry(s, e(20));
    s = pushEntry(s, e(30));
    // entries: [INITIAL, e(10), e(20), e(30)], index 3
    expect(s.index).toBe(3);

    s = goBack(s);
    expect(currentEntry(s)).toEqual(e(20));
    s = goBack(s);
    expect(currentEntry(s)).toEqual(e(10));
    s = goBack(s);
    expect(currentEntry(s)).toEqual(INITIAL);
    expect(canGoBack(s)).toBe(false);
    expect(goBack(s)).toBe(s); // no-op past start

    s = goForward(s);
    expect(currentEntry(s)).toEqual(e(10));
    s = goForward(s);
    expect(currentEntry(s)).toEqual(e(20));
    s = goForward(s);
    expect(currentEntry(s)).toEqual(e(30));
    expect(canGoForward(s)).toBe(false);
    expect(goForward(s)).toBe(s); // no-op past end
  });

  it("pushing after going back truncates the forward history (browser model)", () => {
    let s = emptyHistory;
    s = pushEntry(s, e(10));
    s = pushEntry(s, e(20));
    s = pushEntry(s, e(30));
    s = goBack(s); // at index 2, entry e(20)
    s = goBack(s); // at index 1, entry e(10)
    s = pushEntry(s, e(50)); // truncates e(20), e(30)
    expect(s.entries).toEqual([INITIAL, e(10), e(50)]);
    expect(s.index).toBe(2);
    expect(canGoForward(s)).toBe(false);
  });
});
