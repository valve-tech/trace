import type { CallFrame, OpcodeStep } from "../../../api/debugger";
import type { SourceLocation } from "../../../api/source";

/**
 * Unified execution tree, ported from Remix's InternalCallTree.
 *
 * One stack-walk produces a single tree where external CALLs and internal
 * Solidity functions share one nesting: an external sub-call nests inside the
 * internal function that made it (`swapBack()` → `router.swap(...)`), and
 * internal functions nest inside each other. This is the only way to get the
 * structure right — external frames and internal scopes are not parallel.
 *
 * Internal scopes come from the source map's `jump` field: `'i'` enters a
 * function, `'o'` returns. Two hard-won caveats from optimized bytecode:
 *   - `'o'` source locations are unreliable (the optimizer SHARES return
 *     blocks across functions), so we pop by COUNT, never trust an `'o'`'s
 *     mapped function.
 *   - Entering a public function can emit two consecutive `'i'` jumps to the
 *     same declaration line; we dedupe those so the function isn't doubled.
 *
 * Names come from the jump-site source snippet (no AST), so casts/library
 * calls read approximately; structure and lines are exact.
 */

export type ExecNode =
  | { kind: "call"; frame: CallFrame; startStep: number; children: ExecNode[] }
  | {
      kind: "fn";
      name: string;
      line: number;
      startStep: number;
      endStep: number;
      children: ExecNode[];
      /** True when the entry mapped to a `function …` declaration (the public
       *  dispatch into a function body) rather than an internal call site.
       *  These are redundant with the frame and get hoisted away. */
      decl?: boolean;
    };

type SourceMap = Record<number, SourceLocation | null>;

function funcNameFromSnippet(snippet: string): string {
  const m = snippet.trim().match(/(\w+)\s*\(/);
  return m?.[1] ?? "internal";
}

/** Own-code range of a frame entered at `entry`: [entry, end) at its depth. */
function frameRange(entry: number, steps: OpcodeStep[]): { end: number; depth: number } {
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

/**
 * Per contract address, the program counters that contract executed in its own
 * frames — the pcs whose source map we need to trace its internal functions.
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

type Event =
  | { step: number; t: "enter"; name: string; line: number; decl: boolean }
  | { step: number; t: "exit" }
  | { step: number; t: "call"; child: CallFrame };

/**
 * Hoist away "declaration" fn nodes — the public/dispatch entries whose source
 * mapped to a `function …` header. They duplicate the enclosing frame's label
 * and just add a redundant level; their children belong to the parent.
 */
function flattenDecls(nodes: ExecNode[]): ExecNode[] {
  const out: ExecNode[] = [];
  for (const n of nodes) {
    if (n.kind === "fn") {
      const kids = flattenDecls(n.children);
      if (n.decl) out.push(...kids);
      else out.push({ ...n, children: kids });
    } else {
      out.push({ ...n, children: flattenDecls(n.children) });
    }
  }
  return out;
}

// At equal step, enter before call (a call nests in the just-entered fn)
// before exit (close after the call is placed).
const RANK: Record<Event["t"], number> = { enter: 0, call: 1, exit: 2 };

/**
 * Build the unified execution tree rooted at `root`. Every frame becomes a
 * `call` node; its children are sub-call frames and internal `fn` scopes
 * interleaved in execution order.
 */
export function buildExecutionTree(
  root: CallFrame,
  frameStepMap: Map<CallFrame, number>,
  steps: OpcodeStep[],
  sourceMapsByAddr: Record<string, SourceMap>,
): ExecNode {
  const build = (frame: CallFrame): Extract<ExecNode, { kind: "call" }> => {
    const entry = frameStepMap.get(frame) ?? 0;
    const node: Extract<ExecNode, { kind: "call" }> = {
      kind: "call",
      frame,
      startStep: entry,
      children: [],
    };
    const { end, depth } = frameRange(entry, steps);
    const sm = frame.to ? sourceMapsByAddr[frame.to.toLowerCase()] : undefined;

    const events: Event[] = [];
    if (sm) {
      for (let i = entry; i < end; i++) {
        if (steps[i]!.depth !== depth) continue; // inside a sub-call — not ours
        const loc = sm[steps[i]!.pc];
        if (!loc) continue;
        if (loc.jumpType === "i") {
          events.push({
            step: i,
            t: "enter",
            name: funcNameFromSnippet(loc.sourceSnippet),
            line: loc.line,
            decl: /^\s*function\b/.test(loc.sourceSnippet),
          });
        } else if (loc.jumpType === "o") {
          events.push({ step: i, t: "exit" });
        }
      }
    }
    for (const child of frame.calls ?? []) {
      events.push({ step: frameStepMap.get(child) ?? end, t: "call", child });
    }
    events.sort((a, b) => a.step - b.step || RANK[a.t] - RANK[b.t]);

    type OpenNode = Extract<ExecNode, { kind: "call" }> | Extract<ExecNode, { kind: "fn" }>;
    const stack: OpenNode[] = [node];
    let lastOwn = entry;

    for (const ev of events) {
      lastOwn = ev.step;
      const top = stack[stack.length - 1]!;
      if (ev.t === "enter") {
        // Dedupe the public-function double-entry (two 'i' to the same line).
        if (top.kind === "fn" && top.name === ev.name && top.line === ev.line) continue;
        const fn: Extract<ExecNode, { kind: "fn" }> = {
          kind: "fn",
          name: ev.name,
          line: ev.line,
          startStep: ev.step,
          endStep: ev.step,
          children: [],
          decl: ev.decl,
        };
        top.children.push(fn);
        stack.push(fn);
      } else if (ev.t === "exit") {
        if (stack.length > 1 && stack[stack.length - 1]!.kind === "fn") {
          const closed = stack.pop() as Extract<ExecNode, { kind: "fn" }>;
          closed.endStep = ev.step;
        }
      } else {
        // Sub-call. A codeless callee (value transfer / precompile / EOA) ran
        // no deeper opcodes → it's a leaf, not a frame to recurse into.
        const childEntry = frameStepMap.get(ev.child);
        const ranCode =
          childEntry !== undefined && (steps[childEntry]?.depth ?? 0) > depth;
        top.children.push(
          ranCode
            ? build(ev.child)
            : { kind: "call", frame: ev.child, startStep: childEntry ?? ev.step, children: [] },
        );
      }
    }
    for (const open of stack) if (open.kind === "fn") open.endStep = lastOwn;
    return node;
  };

  const root2 = build(root);
  // Strip the redundant public-dispatch wrappers so internal calls sit directly
  // under their frame.
  root2.children = flattenDecls(root2.children);
  return root2;
}
