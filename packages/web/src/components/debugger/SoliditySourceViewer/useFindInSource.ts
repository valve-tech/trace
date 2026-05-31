import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

/**
 * In-pane find for the Solidity source viewer (Cmd/Ctrl+F).
 *
 * Native browser find searches the whole page (call tree + opcode list +
 * source pane all at once) and can't scroll the source pane sensibly, so
 * we intercept the keystroke and run our own line-based search.
 *
 * Owns all find state, plus three effects:
 *   1. Window-level Cmd/Ctrl+F interceptor that opens the bar.
 *   2. Clamps `activeMatch` back into range when `matchLines` shrinks.
 *   3. Scrolls the active match into view when it changes or the bar opens.
 *
 * Takes `containerRef` so the scroll effect can find the active line's
 * DOM element via `[data-line="N"]`. The orchestrator already maintains
 * that ref on the scroll container and tags each rendered line with
 * `data-line` for unrelated reasons (auto-scroll-to-current-line).
 */
export interface UseFindInSourceResult {
  open: boolean;
  setOpen: (open: boolean) => void;
  query: string;
  setQuery: (query: string) => void;
  activeMatch: number;
  /** 1-indexed line numbers that contain a case-insensitive substring match. */
  matchLines: number[];
  /** Set form of matchLines for O(1) "is this line a match?" checks during render. */
  matchSet: Set<number>;
  /** 1-indexed line of the currently selected match, or null if none. */
  activeMatchLine: number | null;
  /** Move to the next (dir=1) or previous (dir=-1) match; wraps. */
  stepMatch: (dir: 1 | -1) => void;
  /** Close the bar AND reset query + active index. */
  closeFind: () => void;
  /** Pass to the bar's <input ref={...}> so Cmd/Ctrl+F can re-focus it. */
  inputRef: RefObject<HTMLInputElement | null>;
}

export function useFindInSource(
  lines: string[],
  containerRef: RefObject<HTMLDivElement | null>,
): UseFindInSourceResult {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);

  const matchLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as number[];
    const out: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i]!.toLowerCase().includes(q)) out.push(i + 1);
    }
    return out;
  }, [query, lines]);

  const matchSet = useMemo(() => new Set(matchLines), [matchLines]);
  const activeMatchLine = matchLines[activeMatch] ?? null;

  // Clamp active index back into range when matches shrink (e.g. user
  // refined the query). Reset to 0 rather than to the last item so the
  // user lands at the first match of the new search.
  useEffect(() => {
    if (activeMatch >= matchLines.length) setActiveMatch(0);
  }, [matchLines, activeMatch]);

  // Scroll the active match into view when it changes or the bar opens.
  useEffect(() => {
    if (!open || activeMatchLine == null) return;
    const el = containerRef.current?.querySelector(
      `[data-line="${activeMatchLine}"]`,
    );
    el?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [open, activeMatchLine, containerRef]);

  const stepMatch = useCallback(
    (dir: 1 | -1) => {
      setActiveMatch((i) => {
        const n = matchLines.length;
        if (n === 0) return 0;
        return (i + dir + n) % n;
      });
    },
    [matchLines.length],
  );

  // Window-level Cmd/Ctrl+F interceptor. Mounts/unmounts with the hook.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.select());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeFind = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveMatch(0);
  }, []);

  return {
    open,
    setOpen,
    query,
    setQuery,
    activeMatch,
    matchLines,
    matchSet,
    activeMatchLine,
    stepMatch,
    closeFind,
    inputRef,
  };
}
