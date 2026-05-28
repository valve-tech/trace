import type { OpcodeStep } from "../../../api/debugger";
import type { SourceLocation } from "../../../api/source";

/**
 * Dev-only navigation instrumentation. Lets a headless check verify that a
 * call-tree row lands on the source location it *should* — by exposing the
 * same step→contract→source-map resolution the UI uses, plus the built tree.
 * Everything here is pure derived data published on a window handle; gated
 * behind `import.meta.env.DEV` at every call site so it never ships in prod.
 */

export interface FrameRange {
  addr: string | null;
  entry: number;
  end: number;
  depth: number;
}

export interface NavContext {
  steps: OpcodeStep[];
  frameRanges: FrameRange[];
  /** Per-contract pc→source map, lower-cased addresses (all contracts in trace). */
  traceSourceMaps: Record<string, Record<number, SourceLocation | null>>;
}

/** The deepest frame whose [entry,end) range covers `step` — the active code. */
export function activeContractAt(ctx: NavContext, step: number): string | null {
  let best: string | null = null;
  let bestDepth = -1;
  for (const f of ctx.frameRanges) {
    if (f.entry <= step && step < f.end && f.depth > bestDepth) {
      bestDepth = f.depth;
      best = f.addr;
    }
  }
  return best;
}

/** Source location for the active contract at `step` (snippet included). */
export function locAt(
  ctx: NavContext,
  step: number,
): (SourceLocation & { addr: string | null }) | null {
  const s = ctx.steps[step];
  if (!s) return null;
  const addr = activeContractAt(ctx, step);
  const loc = addr ? ctx.traceSourceMaps[addr.toLowerCase()]?.[s.pc] ?? null : null;
  return loc ? { ...loc, addr } : null;
}

/** Where the source pane is currently resolved — pure derived state, published
 *  so a headless check can read where a click actually landed. */
export interface NavState {
  currentStep: number;
  activeContract: string | null;
  file: string | null;
  effectiveLine: number | null;
}

interface TraceNavWindow {
  ctx?: NavContext;
  tree?: unknown;
  state?: NavState;
  activeContractAt?: (step: number) => string | null;
  locAt?: (step: number) => (SourceLocation & { addr: string | null }) | null;
}

export function publishNavContext(ctx: NavContext): void {
  const w = window as unknown as { __traceNav?: TraceNavWindow };
  w.__traceNav = {
    ...(w.__traceNav ?? {}),
    ctx,
    activeContractAt: (step) => activeContractAt(ctx, step),
    locAt: (step) => locAt(ctx, step),
  };
}

export function publishNavTree(tree: unknown): void {
  const w = window as unknown as { __traceNav?: TraceNavWindow };
  w.__traceNav = { ...(w.__traceNav ?? {}), tree };
}

export function publishNavState(state: NavState): void {
  const w = window as unknown as { __traceNav?: TraceNavWindow };
  w.__traceNav = { ...(w.__traceNav ?? {}), state };
}
