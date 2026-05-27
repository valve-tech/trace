import type { OpcodeStep } from "../../../api/debugger";
import type { SourceLocation } from "../../../api/source";

/**
 * Dev-only navigation instrumentation. Lets a headless check verify that a
 * call-tree row lands on the source location it *should* — by exposing the
 * same step→contract→source-map resolution the UI uses, plus a buffer of
 * actual click outcomes. Gated behind `import.meta.env.DEV` at every call site
 * so it never ships in a production bundle.
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

/** One recorded UI navigation: what was clicked vs. where it actually landed. */
export interface NavRecord {
  intentStep: number | null;
  intentFuncName: string | null;
  currentStep: number;
  activeContract: string | null;
  file: string | null;
  effectiveLine: number | null;
  overrideLine: number | null;
  sourceMapLine: number | null;
  snippet: string | null;
}

interface TraceNavWindow {
  ctx?: NavContext;
  tree?: unknown;
  activeContractAt?: (step: number) => string | null;
  locAt?: (step: number) => (SourceLocation & { addr: string | null }) | null;
  records?: NavRecord[];
  last?: NavRecord;
}

export function publishNavContext(ctx: NavContext): void {
  const w = window as unknown as { __traceNav?: TraceNavWindow };
  w.__traceNav = {
    ...(w.__traceNav ?? {}),
    ctx,
    activeContractAt: (step) => activeContractAt(ctx, step),
    locAt: (step) => locAt(ctx, step),
    records: w.__traceNav?.records ?? [],
  };
}

export function publishNavTree(tree: unknown): void {
  const w = window as unknown as { __traceNav?: TraceNavWindow };
  w.__traceNav = { ...(w.__traceNav ?? {}), tree };
}

export function recordNav(rec: NavRecord): void {
  const w = window as unknown as { __traceNav?: TraceNavWindow };
  if (!w.__traceNav) w.__traceNav = {};
  w.__traceNav.last = rec;
  (w.__traceNav.records ??= []).push(rec);
}
