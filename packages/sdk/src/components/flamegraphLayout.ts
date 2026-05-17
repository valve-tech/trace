import type { Hex } from "viem";
import type { CallType, TraceFrame } from "../types.js";
import { walkCallTree } from "../traversal/walkCallTree.js";
import { getFunctionSelector } from "./formatters.js";

export interface FlamegraphBar {
  frame: TraceFrame;
  depth: number;
  /** Left offset as a percentage of total gas (0-100). */
  startGas: number;
  /** Bar width as a percentage of total gas (0-100). */
  width: number;
  /** Display label — typically the function name (or selector fallback). */
  label: string;
  /** Hex color (e.g. "rgb(99, 102, 241)") for this bar. */
  color: string;
}

const CALL_COLORS: Record<CallType, string> = {
  CALL: "#6366f1",
  STATICCALL: "#22c55e",
  DELEGATECALL: "#a78bfa",
  CALLCODE: "#a78bfa",
  CREATE: "#06b6d4",
  CREATE2: "#06b6d4",
  SELFDESTRUCT: "#ef4444",
};

const UNKNOWN_COLOR = "#8B5CF6";

/**
 * Lighten or darken a `#rrggbb` hex string by `amount` per channel (0-255).
 * Returns an `rgb(...)` string. Caller is responsible for passing a valid
 * 7-char hex; bad inputs produce NaN channels and are clamped to 0/255.
 */
export function adjustBrightness(hex: string, amount: number): string {
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

export function getBarColor(type: CallType, depth: number): string {
  const base = CALL_COLORS[type] ?? UNKNOWN_COLOR;
  // Alternate brightness by depth to visually separate adjacent layers.
  const lighten = depth % 2 === 0 ? 0 : 15;
  return adjustBrightness(base, lighten);
}

export interface LayoutOptions {
  /** Resolve a 4-byte selector to a readable label (e.g. "transfer"). */
  resolveSelector?: (selector: Hex) => string | undefined;
}

/**
 * Compute flamegraph bars from a TraceFrame tree. Pure function — no I/O,
 * no React, no DOM. The output is an ordered list of bars with depth, left
 * offset, and width as percentages of the root's `gasUsed`.
 *
 * Uses the SDK's `walkCallTree` (explicit stack) for safe traversal of deep
 * trees.
 */
export function buildFlamegraphLayout(
  root: TraceFrame,
  options: LayoutOptions = {},
): FlamegraphBar[] {
  const totalGas = root.gasUsed === 0n ? 1n : root.gasUsed;
  const bars: FlamegraphBar[] = [];

  // We need to lay out each child within its parent's start-gas range. Track
  // the running offset per depth via a stack indexed by depth.
  const offsetByDepth: bigint[] = [0n];

  walkCallTree(root, {
    enter: (frame, depth) => {
      // `offsetByDepth[depth]` is guaranteed to be defined: the root sets
      // index 0 at construction, and every enter sets index `depth + 1`
      // (preparing the slot before any child reaches that depth via DFS).
      const startGas = offsetByDepth[depth]!;

      const label = resolveLabel(frame, options.resolveSelector);

      bars.push({
        frame,
        depth,
        startGas: Number((startGas * 10_000n) / totalGas) / 100,
        width: Number((frame.gasUsed * 10_000n) / totalGas) / 100,
        label,
        color: getBarColor(frame.type, depth),
      });

      // Children of this frame start at this frame's startGas; initialize
      // the child-depth offset accordingly. This guarantees the invariant
      // that every depth in `offsetByDepth` is defined before any frame at
      // that depth enters.
      offsetByDepth[depth + 1] = startGas;
    },
    exit: (frame, depth) => {
      // Once we leave a frame, the next sibling at our depth starts after
      // this frame's gas range. `offsetByDepth[depth]` is guaranteed defined
      // because `enter` always initializes it (and possibly extends the
      // array) before children — and therefore before this exit — fires.
      offsetByDepth[depth] = offsetByDepth[depth]! + frame.gasUsed;
    },
  });

  return bars;
}

function resolveLabel(
  frame: TraceFrame,
  resolveSelector?: (selector: Hex) => string | undefined,
): string {
  if (frame.functionName) return frame.functionName;

  const selector = getFunctionSelector(frame.input);
  if (selector === "(fallback)") return frame.type;

  const resolved = resolveSelector?.(selector as Hex);
  if (resolved) return resolved;

  return selector;
}
