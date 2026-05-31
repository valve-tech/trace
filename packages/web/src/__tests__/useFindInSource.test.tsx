import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { useFindInSource } from "../components/debugger/SoliditySourceViewer/useFindInSource";

/**
 * Hook tests for in-pane find. Asserts the matching logic + state
 * transitions + the Cmd/Ctrl+F window keystroke interceptor. The
 * scroll-to-active effect calls `scrollIntoView` on a queried element;
 * jsdom's default `scrollIntoView` is a no-op which is fine for our
 * purposes — we just need to confirm the lookup happens.
 */

const SAMPLE_LINES = [
  "pragma solidity 0.8.20;",
  "contract Counter {",
  "    uint256 public count;",
  "    function increment() external { count++; }",
  "    function reset() external { count = 0; }",
  "}",
];

/** Lightweight test wrapper that creates a container ref but no DOM. */
function useFindInSourceWithRef(lines: string[]) {
  const ref = useRef<HTMLDivElement | null>(null);
  return useFindInSource(lines, ref);
}

describe("useFindInSource — matching", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty matchLines when query is empty", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    expect(result.current.matchLines).toEqual([]);
    expect(result.current.activeMatchLine).toBeNull();
  });

  it("returns 1-indexed line numbers that contain the query (case-insensitive)", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    act(() => result.current.setQuery("count"));
    // "count" appears on lines 2 (in "Counter"), 3, 4, 5
    expect(result.current.matchLines).toEqual([2, 3, 4, 5]);
    expect(result.current.activeMatchLine).toBe(2);
  });

  it("matches case-insensitively (query 'COUNT' matches lowercase 'count' and 'Counter')", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    act(() => result.current.setQuery("COUNT"));
    expect(result.current.matchLines).toEqual([2, 3, 4, 5]);
  });

  it("treats a whitespace-only query as empty (trims before matching)", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    act(() => result.current.setQuery("   "));
    expect(result.current.matchLines).toEqual([]);
  });

  it("returns an empty matchLines when query has no hits", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    act(() => result.current.setQuery("nothinginthere"));
    expect(result.current.matchLines).toEqual([]);
    expect(result.current.activeMatchLine).toBeNull();
  });

  it("exposes matchSet for O(1) lookups during render", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    act(() => result.current.setQuery("count"));
    expect(result.current.matchSet.has(2)).toBe(true);
    expect(result.current.matchSet.has(3)).toBe(true);
    expect(result.current.matchSet.has(1)).toBe(false);
  });
});

describe("useFindInSource — stepMatch wrap-around navigation", () => {
  // Matches for "count" against SAMPLE_LINES are lines [2, 3, 4, 5] —
  // "Counter" on line 2 + "count" on lines 3/4/5.

  it("stepMatch(1) advances to the next match", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    act(() => result.current.setQuery("count"));
    expect(result.current.activeMatchLine).toBe(2);
    act(() => result.current.stepMatch(1));
    expect(result.current.activeMatchLine).toBe(3);
    act(() => result.current.stepMatch(1));
    expect(result.current.activeMatchLine).toBe(4);
  });

  it("stepMatch(1) wraps from the last match back to the first", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    act(() => result.current.setQuery("count"));
    // Step 3× to reach the last match (index 3 = line 5).
    act(() => result.current.stepMatch(1));
    act(() => result.current.stepMatch(1));
    act(() => result.current.stepMatch(1));
    expect(result.current.activeMatchLine).toBe(5);
    act(() => result.current.stepMatch(1));
    expect(result.current.activeMatchLine).toBe(2);
  });

  it("stepMatch(-1) wraps from the first match to the last", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    act(() => result.current.setQuery("count"));
    expect(result.current.activeMatchLine).toBe(2);
    act(() => result.current.stepMatch(-1));
    expect(result.current.activeMatchLine).toBe(5);
  });

  it("stepMatch is a no-op when there are no matches", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    act(() => result.current.setQuery("noooo"));
    act(() => result.current.stepMatch(1));
    expect(result.current.activeMatch).toBe(0);
    expect(result.current.activeMatchLine).toBeNull();
  });
});

describe("useFindInSource — activeMatch clamp", () => {
  it("resets activeMatch to 0 when the new matchLines is shorter than the prior activeMatch", () => {
    const { result, rerender } = renderHook(
      ({ lines }: { lines: string[] }) => useFindInSourceWithRef(lines),
      { initialProps: { lines: SAMPLE_LINES } },
    );
    act(() => result.current.setQuery("count"));
    act(() => result.current.stepMatch(1));
    act(() => result.current.stepMatch(1));
    act(() => result.current.stepMatch(1));
    expect(result.current.activeMatch).toBe(3);

    // Now narrow the source so only the "Counter" + one "count" line remain —
    // matches drop to [2, 3], so the prior activeMatch=3 is out of range and
    // should clamp back to 0.
    rerender({
      lines: [
        "pragma solidity 0.8.20;",
        "contract Counter {",
        "    uint256 public count;",
        "}",
      ],
    });
    expect(result.current.activeMatch).toBe(0);
    expect(result.current.activeMatchLine).toBe(2);
  });
});

describe("useFindInSource — closeFind", () => {
  it("closeFind resets open, query, and activeMatch", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    act(() => result.current.setOpen(true));
    act(() => result.current.setQuery("count"));
    act(() => result.current.stepMatch(1));
    expect(result.current.open).toBe(true);
    expect(result.current.query).toBe("count");
    expect(result.current.activeMatch).toBe(1);

    act(() => result.current.closeFind());
    expect(result.current.open).toBe(false);
    expect(result.current.query).toBe("");
    expect(result.current.activeMatch).toBe(0);
  });
});

describe("useFindInSource — Cmd/Ctrl+F interceptor", () => {
  it("opens the bar on Cmd+F (Meta key)", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    expect(result.current.open).toBe(false);
    act(() => {
      const e = new KeyboardEvent("keydown", { key: "f", metaKey: true });
      window.dispatchEvent(e);
    });
    expect(result.current.open).toBe(true);
  });

  it("opens the bar on Ctrl+F (Control key)", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    act(() => {
      const e = new KeyboardEvent("keydown", { key: "F", ctrlKey: true });
      window.dispatchEvent(e);
    });
    expect(result.current.open).toBe(true);
  });

  it("does not open on plain F (no modifier)", () => {
    const { result } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    act(() => {
      const e = new KeyboardEvent("keydown", { key: "f" });
      window.dispatchEvent(e);
    });
    expect(result.current.open).toBe(false);
  });

  it("removes the keydown listener on unmount (no leak)", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useFindInSourceWithRef(SAMPLE_LINES));
    unmount();
    const removedKeydown = removeSpy.mock.calls.find(
      ([type]) => type === "keydown",
    );
    expect(removedKeydown).toBeDefined();
  });
});

describe("useFindInSource — scroll-to-active integration", () => {
  it("invokes querySelector on the container ref with the active line's data-line", () => {
    // Build a synthetic ref that observes querySelector calls.
    const querySelectorCalls: string[] = [];
    const container = {
      querySelector: (sel: string) => {
        querySelectorCalls.push(sel);
        return null; // no match → no scrollIntoView call
      },
    } as unknown as HTMLDivElement;

    function useTestSetup() {
      const ref = useRef<HTMLDivElement | null>(container);
      const find = useFindInSource(SAMPLE_LINES, ref);
      // Force open so the scroll effect runs.
      const [opened, setOpened] = useState(false);
      if (!opened && !find.open) {
        // Defer to avoid the React setState-in-render warning.
        queueMicrotask(() => {
          find.setOpen(true);
          setOpened(true);
        });
      }
      return find;
    }

    const { result } = renderHook(() => useTestSetup());
    act(() => result.current.setOpen(true));
    act(() => result.current.setQuery("count"));

    // First match for "count" against SAMPLE_LINES is line 2 ("Counter").
    expect(querySelectorCalls).toContain('[data-line="2"]');
  });
});
