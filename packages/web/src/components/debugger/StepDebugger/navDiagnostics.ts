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

/**
 * One internal-jump function-resolution decision. Captured at tree-build
 * time so we can audit cases where the displayed function name doesn't
 * match what the source code actually calls — e.g. shared library entry
 * trampolines that map the JUMPDEST back to an unrelated function's
 * source range.
 *
 * Read in the browser console as:
 *   __traceNav.fnResolves.filter(r => r.name === 'getStorageBool')
 *
 * to find every place the resolver landed on 'getStorageBool' and check
 * whether the user's intent matches.
 */
export interface FnResolve {
  /** The opcode-step index of the JUMP `i` event that triggered the resolution. */
  jumpStep: number;
  /** Frame address whose code we were in when the jump happened. */
  contract: string | null;
  /**
   * The first step after the JUMP whose pc had a source-map entry. This
   * is the "landing" the resolver scored against.
   */
  landingStep: number | null;
  /** File the landing maps into. */
  landingFile: string | null;
  /**
   * The landing's source-map line range (start–end, inclusive). When
   * the optimizer shares a JUMPDEST across many functions, this range
   * tends to span the whole shared block, which is the signal we use
   * to detect "this isn't a specific function entry, it's a trampoline".
   */
  landingStart: number | null;
  landingEnd: number | null;
  /**
   * The function declarations in `landingFile` whose decl line falls
   * INSIDE [landingStart, landingEnd]. Multiple matches → optimizer
   * trampoline / inlined dispatch. One match → unambiguous entry.
   */
  fnsInsideRange: Array<{ name: string; line: number }>;
  /** The name the classifier produced (what the UI displays). */
  classified: string | null;
  /** Was the classification from fnIndex enclosing, or from snippet fallback? */
  source: "fnIndex" | "snippet" | null;
}

interface TraceNavWindow {
  ctx?: NavContext;
  tree?: unknown;
  state?: NavState;
  activeContractAt?: (step: number) => string | null;
  locAt?: (step: number) => (SourceLocation & { addr: string | null }) | null;
  fnResolves?: FnResolve[];
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

export function publishFnResolves(fnResolves: FnResolve[]): void {
  const w = window as unknown as { __traceNav?: TraceNavWindow };
  w.__traceNav = { ...(w.__traceNav ?? {}), fnResolves };
}
