import type { CallFrame, OpcodeStep } from "../../../api/debugger";
import type { SourceLocation } from "../../../api/source";

/**
 * Internal-function tracing, ported from Remix's InternalCallTree.
 *
 * Remix builds the function-scope tree by walking the trace once and reading
 * the source map's `jump` field at each step: `jump:'i'` enters a function
 * (push a scope), `jump:'o'` returns from it (pop). That's the principled
 * alternative to guessing internal calls from PC deltas — it's exact wherever
 * a source map exists.
 *
 * Two differences from Remix, both because we already have a callTracer tree:
 *   - We scope the walk to a single external frame's OWN opcodes (steps at the
 *     frame's depth), so sub-calls into other contracts are handled by their
 *     own frame rather than flattened in.
 *   - We resolve the function name from the source-map snippet at the jump
 *     site (e.g. `pairFor(...)` → "pairFor") rather than the AST, which we
 *     don't load. Names are approximate; structure is exact.
 */

/** A nested internal-function scope within one external call frame. */
export interface ScopeNode {
  funcName: string;
  line: number;
  /** Step where the function was entered (the `jump:'i'`). */
  startStep: number;
  /** Step where it returned (the matching `jump:'o'`), or the frame's last step. */
  endStep: number;
  children: ScopeNode[];
}

type SourceMap = Record<number, SourceLocation | null>;

/** The half-open own-code range of a frame: [entry, end) at the frame's depth. */
function frameRange(
  entry: number,
  steps: OpcodeStep[],
): { end: number; depth: number } {
  const depth = steps[entry]?.depth ?? 1;
  let end = steps.length;
  for (let i = entry + 1; i < steps.length; i++) {
    if (steps[i]!.depth < depth) {
      end = i;
      break;
    }
  }
  return { end, depth };
}

function funcNameFromSnippet(snippet: string): string {
  const m = snippet.trim().match(/(\w+)\s*\(/);
  return m?.[1] ?? "internal";
}

/**
 * Collect, per contract address, the program counters that contract executed
 * in its own frames — the pcs whose source map we need to fetch to trace that
 * contract's internal functions.
 */
export function computePcsByContract(
  root: CallFrame,
  frameStepMap: Map<CallFrame, number>,
  steps: OpcodeStep[],
): Record<string, number[]> {
  const byAddr: Record<string, Set<number>> = {};

  const visit = (frame: CallFrame) => {
    const to = frame.to?.toLowerCase();
    const entry = frameStepMap.get(frame);
    if (to && entry !== undefined) {
      const { end, depth } = frameRange(entry, steps);
      const set = (byAddr[to] ??= new Set());
      for (let i = entry; i < end; i++) {
        if (steps[i]!.depth === depth) set.add(steps[i]!.pc);
      }
    }
    for (const child of frame.calls ?? []) visit(child);
  };
  visit(root);

  const out: Record<string, number[]> = {};
  for (const [addr, set] of Object.entries(byAddr)) out[addr] = [...set];
  return out;
}

/**
 * Build the internal-function scope tree for a single frame by walking its
 * own-depth steps and pushing/popping on source-map jump types.
 */
export function buildScopesForFrame(
  entry: number,
  steps: OpcodeStep[],
  sourceMap: SourceMap,
): ScopeNode[] {
  const { end, depth } = frameRange(entry, steps);
  const roots: ScopeNode[] = [];
  const stack: ScopeNode[] = [];
  let lastOwnStep = entry;

  for (let i = entry; i < end; i++) {
    if (steps[i]!.depth !== depth) continue; // inside a sub-call — not ours
    lastOwnStep = i;
    const loc = sourceMap[steps[i]!.pc];
    if (!loc) continue;

    if (loc.jumpType === "i") {
      const node: ScopeNode = {
        funcName: funcNameFromSnippet(loc.sourceSnippet),
        line: loc.line,
        startStep: i,
        endStep: i,
        children: [],
      };
      (stack[stack.length - 1]?.children ?? roots).push(node);
      stack.push(node);
    } else if (loc.jumpType === "o") {
      const closed = stack.pop();
      if (closed) closed.endStep = i;
    }
  }

  // Close any scopes still open when the frame returned.
  for (const node of stack) node.endStep = lastOwnStep;
  return roots;
}

/** Build internal-function scopes for every frame that has a source map. */
export function buildScopesByFrame(
  root: CallFrame,
  frameStepMap: Map<CallFrame, number>,
  steps: OpcodeStep[],
  sourceMapsByAddr: Record<string, SourceMap>,
): Map<CallFrame, ScopeNode[]> {
  const out = new Map<CallFrame, ScopeNode[]>();
  const visit = (frame: CallFrame) => {
    const to = frame.to?.toLowerCase();
    const entry = frameStepMap.get(frame);
    const map = to ? sourceMapsByAddr[to] : undefined;
    if (map && entry !== undefined) {
      const scopes = buildScopesForFrame(entry, steps, map);
      if (scopes.length > 0) out.set(frame, scopes);
    }
    for (const child of frame.calls ?? []) visit(child);
  };
  visit(root);
  return out;
}
