import type { CallFrame, OpcodeStep } from "../../../api/debugger";
import type { SourceLocation, SourceFile } from "../../../api/source";
import { buildFunctionIndex, classifyFn, type FileIndex } from "./functionIndex";
import type { FnResolve } from "./navDiagnostics";

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
 * Names come from the entry JUMPDEST's snippet, which Solidity maps to the
 * whole FunctionDefinition (so it reads `function name(...)`) — exact for real
 * function entries, including unnamed `receive`/`fallback`/`constructor`. We
 * fall back to the call-site snippet's leading identifier only when the landing
 * isn't a plain declaration (a cast/library jump the map tagged loosely).
 *
 * Emitted events (LOG0–LOG4) are interleaved too: each becomes a leaf `log`
 * node inside whichever function/frame was executing when it fired, decoded to
 * an event signature via the optional `logsByStep` map (built from the receipt
 * logs in the debugger).
 */

export type ExecNode =
  | {
      kind: "call";
      frame: CallFrame;
      startStep: number;
      children: ExecNode[];
      /** Step the callee's first internal jump (`'i'`) lands on — the body of
       *  the function this call dispatched into, in the callee's OWN source map.
       *  Clicking the row navigates here so the source pane lands on the real
       *  function (contract-scoped, never a same-named function in another
       *  file). Absent for value transfers / unverified callees, whose bodies
       *  the optimizer leaves unmapped. */
      dispatchStep?: number;
    }
  | {
      kind: "fn";
      name: string;
      /** The function's definition line (where its body begins), shown on the
       *  row and where a click navigates — not the call site. */
      line: number;
      /** Step where this scope opened (the jump-in) — used for ordering and as
       *  the stable selection key. */
      startStep: number;
      /** Step at the function's first instruction (its entry JUMPDEST). Clicking
       *  the row jumps here so the cursor lands on the definition and you can
       *  step through the body. */
      entryStep: number;
      endStep: number;
      children: ExecNode[];
      /** True when the entry mapped to a `function …` declaration (the public
       *  dispatch into a function body) rather than an internal call site.
       *  These are redundant with the frame and get hoisted away. */
      decl?: boolean;
      /** True when the function is defined in a `library` block (e.g. SafeMath),
       *  so the tree can show/hide library calls separately from a contract's
       *  own internal functions. Requires source content; false otherwise. */
      lib?: boolean;
    }
  /** A LOG0–LOG4 opcode — an emitted event. A leaf: it nests inside whatever
   *  function/frame was executing when it fired, so you see which function
   *  emitted it. `name` is the decoded event signature when we have it. */
  | { kind: "log"; step: number; name: string; topicCount: number }
  /** A surfaced opcode (e.g. SSTORE/TSTORE) the user toggled into the tree. A
   *  leaf nested in the function/frame that ran it; clicking jumps to its step
   *  so the source pane lands on the line that executed it. */
  | { kind: "op"; step: number; op: string; pc: number };

/**
 * Decoded event metadata for a LOG opcode, keyed by the step index at which
 * the LOG executed. Built in the debugger from the receipt's emitted logs
 * (the k-th LOG opcode in execution order is the k-th receipt log).
 */
export type LogsByStep = Map<number, { name: string; topicCount: number }>;

const LOG_ARITY: Record<string, number> = {
  LOG0: 0, LOG1: 1, LOG2: 2, LOG3: 3, LOG4: 4,
};

type SourceMap = Record<number, SourceLocation | null>;

/**
 * Stable identity for a tree row, so a click can keep it highlighted ("you are
 * here") regardless of node kind. Steps are unique enough per row; the extra
 * discriminators guard the rare same-step collision.
 */
export function nodeKey(node: ExecNode): string {
  switch (node.kind) {
    case "call":
      return `c:${node.startStep}:${node.frame.to ?? ""}:${node.frame.input?.slice(0, 10) ?? ""}`;
    case "fn":
      return `f:${node.startStep}:${node.line}:${node.name}`;
    case "log":
      return `l:${node.step}:${node.name}`;
    case "op":
      return `o:${node.step}:${node.op}`;
  }
}

function funcNameFromSnippet(snippet: string): string {
  const m = snippet.trim().match(/(\w+)\s*\(/);
  return m?.[1] ?? "internal";
}

/**
 * Solidity control-flow + low-level keywords that read like calls in the
 * source but aren't function invocations. Used to filter out false
 * positives when we extract the call-site function name from a JUMP
 * opcode's source snippet (e.g. `if (cond)`, `require(x, "msg")`).
 */
const CALL_SITE_NON_FN = new Set([
  "if",
  "for",
  "while",
  "do",
  "switch",
  "return",
  "require",
  "assert",
  "revert",
  "emit",
  "new",
  "delete",
  "try",
  "catch",
  "function",
  "modifier",
  "using",
]);

/**
 * Extract the called function name from a JUMP opcode's source snippet.
 * Looks for an identifier directly followed by `(` — the call expression.
 * Returns null when the snippet doesn't read like a function call (control
 * flow, no identifier, or only a non-function keyword like `if (`).
 *
 * Used as a tiebreaker when the function index disagrees with the call
 * site about which function is being entered — the call site is the
 * source of truth (it names the function the developer wrote), the
 * landing's source map can lie when the optimizer shares JUMPDESTs.
 */
function callSiteFuncName(snippet: string): string | null {
  if (!snippet) return null;
  // Match `<receiver>.<name>(` so we get the called method, not the receiver.
  const dotted = snippet.match(/\.([A-Za-z_]\w*)\s*\(/);
  if (dotted && !CALL_SITE_NON_FN.has(dotted[1]!)) return dotted[1]!;
  // Plain `name(` — the first identifier that's followed by `(`.
  const plain = snippet.match(/\b([A-Za-z_]\w*)\s*\(/);
  if (plain && !CALL_SITE_NON_FN.has(plain[1]!)) return plain[1]!;
  return null;
}

/**
 * Best-effort internal function name. Prefer the definition snippet at the
 * entry JUMPDEST (mapped to the whole FunctionDefinition, so it reads
 * `function NAME(...)`); this gets `_transferFrom`, `mul`, etc. exactly right
 * instead of the cast/receiver that happens to lead the call-site expression.
 * Solidity's special members have no `function` keyword, so match them
 * directly. Fall back to the call-site heuristic when the landing isn't a
 * recognizable declaration (a loosely-tagged 'i' jump).
 */
function funcNameFromDefinition(defSnippet: string | undefined, callSnippet: string): string {
  if (defSnippet) {
    const fn = defSnippet.match(/\bfunction\s+(\w+)/);
    if (fn) return fn[1]!;
    if (/^\s*receive\s*\(/.test(defSnippet)) return "receive";
    if (/^\s*fallback\s*\(/.test(defSnippet)) return "fallback";
    if (/^\s*constructor\b/.test(defSnippet)) return "constructor";
    const mod = defSnippet.match(/\bmodifier\s+(\w+)/);
    if (mod) return mod[1]!;
  }
  return funcNameFromSnippet(callSnippet);
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
  | {
      step: number;
      t: "enter";
      name: string;
      line: number;
      decl: boolean;
      /** Source position at the jump site (in the caller) — drives containment
       *  popping of finished sibling scopes before this one is pushed. */
      curFile: string;
      curLine: number;
      /** The callee's own body range (from the entry JUMPDEST's mapping), used
       *  to close the scope when execution later leaves it. */
      fnFile?: string;
      fnStart?: number;
      fnEnd?: number;
      /** Defined in a `library` block (from the source index, when available). */
      lib?: boolean;
      /** Step at the function's first instruction (the entry JUMPDEST). */
      entryStep: number;
    }
  | { step: number; t: "exit" }
  | { step: number; t: "call"; child: CallFrame; curFile?: string; curLine?: number }
  | { step: number; t: "log"; name: string; topicCount: number; curFile?: string; curLine?: number }
  | { step: number; t: "op"; op: string; pc: number; curFile?: string; curLine?: number };

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
    } else if (n.kind === "call") {
      out.push({ ...n, children: flattenDecls(n.children) });
    } else {
      out.push(n); // log — leaf, nothing to recurse
    }
  }
  return out;
}

// At equal step: enter before call (a call nests in the just-entered fn),
// then log (it belongs to the open scope), then exit (close after both).
const RANK: Record<Event["t"], number> = { enter: 0, call: 1, log: 2, op: 2, exit: 3 };

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
  logsByStep?: LogsByStep,
  /** Opcodes the user toggled into the tree (e.g. SSTORE, TSTORE). Each matching
   *  step becomes a leaf `op` node in the function/frame that ran it. Empty by
   *  default, so the tree carries no opcode rows unless asked. */
  opSet?: Set<string>,
  /** Per-contract source files (lower-cased address keys). When present, used
   *  to name internal functions exactly and flag library calls. */
  sourcesByAddr?: Record<string, SourceFile[]>,
  /** Dev-only: callback to receive each internal-jump function-resolution
   *  decision. Used by navDiagnostics to publish a per-tree audit log on
   *  window.__traceNav.fnResolves. Production callers pass undefined. */
  onFnResolve?: (r: FnResolve) => void,
): ExecNode {
  // Per-contract symbol index, built once and reused across that contract's
  // frames (a contract recurs many times in a busy trace).
  const indexCache = new Map<string, Map<string, FileIndex>>();
  const indexFor = (addr: string | undefined): Map<string, FileIndex> | undefined => {
    if (!addr || !sourcesByAddr) return undefined;
    const key = addr.toLowerCase();
    let idx = indexCache.get(key);
    if (!idx) {
      const files = sourcesByAddr[key];
      if (!files) return undefined;
      idx = buildFunctionIndex(files);
      indexCache.set(key, idx);
    }
    return idx;
  };

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
    const fnIndex = indexFor(frame.to);

    // The body range a function entered at `i` occupies — read from the entry
    // JUMPDEST it lands on, which Solidity maps to the whole FunctionDefinition.
    // Lets us close the scope by containment when execution leaves that range,
    // covering the returns the optimizer emits with no `'o'` marker.
    const landingRange = (
      i: number,
    ): { step: number; file: string; start: number; end: number; snippet: string } | null => {
      for (let j = i + 1; j < end; j++) {
        if (steps[j]!.depth !== depth) continue;
        const l = sm?.[steps[j]!.pc];
        if (l) return { step: j, file: l.file, start: l.line, end: l.endLine, snippet: l.sourceSnippet };
      }
      return null;
    };

    const events: Event[] = [];
    for (let i = entry; i < end; i++) {
      if (steps[i]!.depth !== depth) continue; // inside a sub-call — not ours
      const op = steps[i]!.op;
      const loc = sm?.[steps[i]!.pc];
      // Emitted event: a LOG0–LOG4 at our own depth. Decoded name (if any)
      // comes from the receipt logs, matched by step.
      const arity = LOG_ARITY[op];
      if (arity !== undefined) {
        const meta = logsByStep?.get(i);
        events.push({
          step: i,
          t: "log",
          name: meta?.name ?? op,
          topicCount: meta?.topicCount ?? arity,
          curFile: loc?.file,
          curLine: loc?.line,
        });
        continue;
      }
      // A toggled-on opcode (SSTORE/TSTORE/…) at our own depth — a leaf in the
      // scope currently executing. Not a jump, so no source loc is required.
      if (opSet?.has(op)) {
        events.push({ step: i, t: "op", op, pc: steps[i]!.pc, curFile: loc?.file, curLine: loc?.line });
        continue;
      }
      if (!loc) continue;
      if (loc.jumpType === "i") {
        const range = landingRange(i);
        // The source index (when we have it) names the enclosing function
        // exactly and flags library membership; fall back to the snippet
        // heuristic otherwise.
        const cls = classifyFn(fnIndex, range?.file, range?.start);
        const fallback = cls?.name
          ? null
          : funcNameFromDefinition(range?.snippet, loc.sourceSnippet);

        // Call-site override: the JUMP `i` source snippet usually points
        // at the call expression (`getStorageBytes32(name)`), which names
        // the function being entered. If the index's enclosing-based
        // classification disagrees with the call site AND the call-site
        // candidate IS a known function in the same source index, trust
        // the call site. This catches the optimizer-shared-trampoline
        // case where the JUMPDEST maps back to an unrelated earlier
        // function in the library.
        const callSite = callSiteFuncName(loc.sourceSnippet);
        let resolvedName = cls?.name ?? fallback;
        let resolvedSource: "fnIndex" | "snippet" | "callSite" | null =
          cls?.name ? "fnIndex" : fallback ? "snippet" : null;
        let callSiteOverrode = false;
        if (
          callSite &&
          resolvedName &&
          callSite !== resolvedName &&
          range?.file &&
          fnIndex
        ) {
          const fi = fnIndex.get(range.file);
          if (fi?.fns.some((fn) => fn.name === callSite)) {
            resolvedName = callSite;
            resolvedSource = "callSite";
            callSiteOverrode = true;
          }
        }

        if (onFnResolve) {
          // Enumerate function decls in fnIndex whose decl line falls
          // INSIDE the JUMPDEST's source range. Multiple matches → the
          // optimizer's shared trampoline is mapping back to ambiguous
          // source. Empty → the enclosing-only fallback was the only
          // signal available.
          const fnsInsideRange: FnResolve["fnsInsideRange"] = [];
          if (range && fnIndex) {
            const fi = fnIndex.get(range.file);
            if (fi) {
              for (const fn of fi.fns) {
                if (fn.line >= range.start && fn.line <= range.end) {
                  fnsInsideRange.push({ name: fn.name, line: fn.line });
                }
              }
            }
          }
          onFnResolve({
            jumpStep: i,
            contract: frame.to ?? null,
            landingStep: range?.step ?? null,
            landingFile: range?.file ?? null,
            landingStart: range?.start ?? null,
            landingEnd: range?.end ?? null,
            fnsInsideRange,
            classified: resolvedName,
            source: resolvedSource,
            callSite,
            callSiteOverrode,
          });
        }
        events.push({
          step: i,
          t: "enter",
          name: resolvedName ?? "",
          // Show the definition line (where the body begins), not the call site.
          line: range?.start ?? loc.line,
          decl: /^\s*function\b/.test(loc.sourceSnippet),
          curFile: loc.file,
          curLine: loc.line,
          fnFile: range?.file,
          fnStart: range?.start,
          fnEnd: range?.end,
          lib: cls?.isLibrary ?? false,
          entryStep: range?.step ?? i,
        });
      } else if (loc.jumpType === "o") {
        events.push({ step: i, t: "exit" });
      }
    }
    // Call-site source position for a sub-call: scan back from its entry to the
    // nearest own-depth mapped step (the CALL opcode lives in the caller's code).
    const callSiteLoc = (callStep: number): SourceLocation | null => {
      for (let j = Math.min(callStep, end - 1); j >= entry; j--) {
        if (steps[j]!.depth !== depth) continue;
        const l = sm?.[steps[j]!.pc];
        if (l) return l;
      }
      return null;
    };
    for (const child of frame.calls ?? []) {
      const step = frameStepMap.get(child) ?? end;
      const site = callSiteLoc(step);
      events.push({ step, t: "call", child, curFile: site?.file, curLine: site?.line });
    }
    events.sort((a, b) => a.step - b.step || RANK[a.t] - RANK[b.t]);

    // A scope on the open stack, paired with the source range it occupies. The
    // range (when known) lets us close it by containment; the root call node has
    // no range and so always "contains" the current position.
    interface Open {
      node: Extract<ExecNode, { kind: "call" }> | Extract<ExecNode, { kind: "fn" }>;
      file?: string;
      start?: number;
      end?: number;
    }
    const stack: Open[] = [{ node }];
    let lastOwn = entry;

    // Close finished scopes by containment — the safety net for returns the
    // optimizer emitted without an `'o'` marker. Distinct functions occupy
    // DISJOINT source ranges, so "the line left the current scope" happens on a
    // call (line jumps into a callee) just as much as on a return. To tell them
    // apart we only act on a return: find the deepest *ancestor fn* whose body
    // range still contains the line and pop back down to it. If no open fn
    // contains the line, we've entered a new function (often via a jump the map
    // didn't tag `'i'`) — leave the stack be and let it nest under the top.
    const popLeftScopes = (file?: string, line?: number, atStep?: number) => {
      if (!file || line === undefined) return;
      let target = -1;
      for (let k = stack.length - 1; k >= 1; k--) {
        const s = stack[k]!;
        if (
          s.node.kind === "fn" &&
          s.start !== undefined &&
          s.end !== undefined &&
          s.file === file &&
          line >= s.start &&
          line <= s.end
        ) {
          target = k;
          break;
        }
      }
      if (target < 1) return; // no containing ancestor fn → not a return
      while (stack.length - 1 > target) {
        const popped = stack.pop()!.node;
        if (atStep !== undefined && popped.kind === "fn") popped.endStep = atStep;
      }
    };

    for (const ev of events) {
      lastOwn = ev.step;
      if (ev.t !== "exit") popLeftScopes(ev.curFile, ev.curLine, ev.step);
      const top = stack[stack.length - 1]!.node;
      if (ev.t === "enter") {
        // First internal jump into this frame = the function it dispatched into.
        // Recorded on the frame node so a tree-row click lands on the real
        // function body via the callee's own source map.
        if (node.dispatchStep === undefined) node.dispatchStep = ev.entryStep;
        // Dedupe the public-function double-entry (two 'i' to the same line).
        if (top.kind === "fn" && top.name === ev.name && top.line === ev.line) continue;
        const fn: Extract<ExecNode, { kind: "fn" }> = {
          kind: "fn",
          name: ev.name,
          line: ev.line,
          startStep: ev.step,
          entryStep: ev.entryStep,
          endStep: ev.step,
          children: [],
          decl: ev.decl,
          lib: ev.lib,
        };
        top.children.push(fn);
        stack.push({ node: fn, file: ev.fnFile, start: ev.fnStart, end: ev.fnEnd });
      } else if (ev.t === "exit") {
        if (stack.length > 1 && stack[stack.length - 1]!.node.kind === "fn") {
          const closed = stack.pop()!.node as Extract<ExecNode, { kind: "fn" }>;
          closed.endStep = ev.step;
        }
      } else if (ev.t === "log") {
        // Emitted event — a leaf inside whichever scope is currently open.
        top.children.push({
          kind: "log",
          step: ev.step,
          name: ev.name,
          topicCount: ev.topicCount,
        });
      } else if (ev.t === "op") {
        // Toggled opcode — a leaf inside the scope that executed it.
        top.children.push({ kind: "op", step: ev.step, op: ev.op, pc: ev.pc });
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
    for (const open of stack) if (open.node.kind === "fn") open.node.endStep = lastOwn;
    return node;
  };

  const root2 = build(root);
  // Strip the redundant public-dispatch wrappers so internal calls sit directly
  // under their frame.
  root2.children = flattenDecls(root2.children);
  return root2;
}

/** Which node kinds the tree should show. Calls (the frame backbone) and any
 *  toggled-in `op` leaves are always kept; the rest are toggleable. Internal
 *  and library functions split on the fn node's `lib` flag. */
export interface TreeFilters {
  internal: boolean;
  library: boolean;
  events: boolean;
}

/**
 * Apply the visibility toggles to a built tree. Hiding a function doesn't drop
 * what it contained — its children are promoted to its parent (same as the
 * decl-hoist), so a hidden function's calls/opcodes stay visible in place.
 * Cheap enough to run on every toggle; no rebuild needed (opcodes, which change
 * the node set, are handled at build time instead).
 */
export function filterExecutionTree(root: ExecNode, filters: TreeFilters): ExecNode {
  const visit = (nodes: ExecNode[]): ExecNode[] => {
    const out: ExecNode[] = [];
    for (const n of nodes) {
      if (n.kind === "log") {
        if (filters.events) out.push(n);
      } else if (n.kind === "op") {
        out.push(n);
      } else if (n.kind === "call") {
        out.push({ ...n, children: visit(n.children) });
      } else {
        // fn: keep it (with filtered children) when its category is on, else
        // promote its children up so what it contained stays visible.
        const kids = visit(n.children);
        const show = n.lib ? filters.library : filters.internal;
        if (show) out.push({ ...n, children: kids });
        else out.push(...kids);
      }
    }
    return out;
  };
  return root.kind === "call" || root.kind === "fn"
    ? { ...root, children: visit(root.children) }
    : root;
}
