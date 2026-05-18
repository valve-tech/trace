import { useCallback, useEffect, useState } from "react";
import type { OpcodeStep } from "../types.js";

/**
 * EVM call-family opcodes — anything that hands execution to another context.
 * Used by `nextCall()` to seek to the next sub-call site.
 */
export function isCallOp(op: string): boolean {
  return (
    op === "CALL" ||
    op === "DELEGATECALL" ||
    op === "STATICCALL" ||
    op === "CREATE" ||
    op === "CREATE2" ||
    op === "CALLCODE"
  );
}

/**
 * Storage-touching opcodes (persistent + transient). Used by `nextStorage()`
 * to seek to the next storage read/write.
 */
export function isStorageOp(op: string): boolean {
  return op === "SLOAD" || op === "SSTORE" || op === "TLOAD" || op === "TSTORE";
}

/**
 * LOG0–LOG4. Used by `nextLog()` to seek to the next event emission.
 */
export function isLogOp(op: string): boolean {
  return op.startsWith("LOG");
}

export interface OpcodeNavigation {
  /** Index of the current step in the `steps` array. Always in `[0, totalSteps-1]` when totalSteps > 0; otherwise 0. */
  currentIndex: number;
  /** The current step, or `undefined` if `steps` is empty. */
  step: OpcodeStep | undefined;
  totalSteps: number;
  canGoForward: boolean;
  canGoBack: boolean;
  /** Advance one step. No-op at the end. */
  goForward: () => void;
  /** Retreat one step. No-op at the start. */
  goBack: () => void;
  /** Jump to a specific index. Clamped to `[0, totalSteps-1]`. */
  jumpTo: (index: number) => void;
  /**
   * Advance to the next step whose opcode matches `predicate`. No-op if none
   * found. The search starts strictly after `currentIndex`, so calling
   * `jumpToNext` on a step that itself matches will skip to the *next* match.
   */
  jumpToNext: (predicate: (op: string) => boolean) => void;
  /** Convenience: `jumpToNext(isCallOp)`. */
  nextCall: () => void;
  /** Convenience: `jumpToNext(isStorageOp)`. */
  nextStorage: () => void;
  /** Convenience: `jumpToNext(isLogOp)`. */
  nextLog: () => void;
}

export interface UseOpcodeNavigationOptions {
  /** Position to start at on first mount and on `steps`-identity change. Clamped. */
  initialIndex?: number;
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function resolveStart(initialIndex: number, totalSteps: number): number {
  if (totalSteps === 0) return 0;
  return clamp(initialIndex, 0, totalSteps - 1);
}

/**
 * Pure step-navigation hook for an EVM opcode trace. Owns no source-map or
 * contract metadata — consumers wrap with their own enrichment hooks. Resets
 * to `initialIndex` (default 0) whenever the `steps` array identity changes,
 * so swapping in a different trace rewinds navigation predictably.
 */
export function useOpcodeNavigation(
  steps: OpcodeStep[],
  options: UseOpcodeNavigationOptions = {},
): OpcodeNavigation {
  const { initialIndex = 0 } = options;
  const totalSteps = steps.length;

  const [currentIndex, setCurrentIndex] = useState(() =>
    resolveStart(initialIndex, totalSteps),
  );

  useEffect(() => {
    setCurrentIndex(resolveStart(initialIndex, totalSteps));
    // We watch the `steps` reference (not its length) so consumers control
    // when a reset happens by re-creating the array. `initialIndex` is also
    // watched so a programmatic change re-anchors the cursor.
  }, [steps, initialIndex, totalSteps]);

  const jumpTo = useCallback(
    (index: number) => {
      if (totalSteps === 0) return;
      setCurrentIndex(clamp(index, 0, totalSteps - 1));
    },
    [totalSteps],
  );

  const goForward = useCallback(() => {
    setCurrentIndex((i) => (i < totalSteps - 1 ? i + 1 : i));
  }, [totalSteps]);

  const goBack = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const jumpToNext = useCallback(
    (predicate: (op: string) => boolean) => {
      setCurrentIndex((i) => {
        for (let j = i + 1; j < totalSteps; j++) {
          if (predicate(steps[j]!.op)) return j;
        }
        return i;
      });
    },
    [steps, totalSteps],
  );

  const nextCall = useCallback(() => jumpToNext(isCallOp), [jumpToNext]);
  const nextStorage = useCallback(
    () => jumpToNext(isStorageOp),
    [jumpToNext],
  );
  const nextLog = useCallback(() => jumpToNext(isLogOp), [jumpToNext]);

  const step = totalSteps === 0 ? undefined : steps[currentIndex];

  return {
    currentIndex,
    step,
    totalSteps,
    canGoForward: currentIndex < totalSteps - 1,
    canGoBack: currentIndex > 0,
    goForward,
    goBack,
    jumpTo,
    jumpToNext,
    nextCall,
    nextStorage,
    nextLog,
  };
}
