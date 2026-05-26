import type { CallFrame, OpcodeStep } from "../../../api/debugger";

const CALL_OPS = new Set(["CALL", "CALLCODE", "DELEGATECALL", "STATICCALL", "CREATE", "CREATE2"]);

/**
 * Map each CallFrame to the opcode-step index where its execution begins.
 *
 * The authoritative signal is opcode **depth**, not the order of CALL-family
 * opcodes. Counting CALLs (the previous approach) desynced because:
 *   - STATICCALL / DELEGATECALL / CALLCODE all enter a frame but were missed,
 *   - calls to codeless accounts (EOAs, precompiles) emit a CALL op but run no
 *     code, so they produce no deeper steps at all.
 *
 * Instead we walk the call tree in DFS pre-order — the same order execution
 * enters subcalls — advancing a single monotonic cursor over the steps. A
 * child's entry is the next step whose depth is exactly one deeper than its
 * parent. A child whose callee ran no code (no such step appears before
 * execution returns to a shallower depth) is mapped to its parent's step, so a
 * click still lands somewhere sensible rather than at 0.
 *
 * The root frame is the transaction entry → step 0.
 */
export function mapFramesToSteps(
  root: CallFrame,
  steps: OpcodeStep[],
): Map<CallFrame, number> {
  const map = new Map<CallFrame, number>();
  if (steps.length === 0) {
    // No opcode trace — best we can do is point everything at 0.
    const visit = (f: CallFrame) => {
      map.set(f, 0);
      for (const c of f.calls ?? []) visit(c);
    };
    visit(root);
    return map;
  }

  map.set(root, 0);
  const rootDepth = steps[0]!.depth;
  let cursor = 1; // monotonic position in `steps`

  const walk = (frame: CallFrame, frameDepth: number, frameStep: number) => {
    for (const child of frame.calls ?? []) {
      const childDepth = frameDepth + 1;
      let entry = -1;
      for (let j = cursor; j < steps.length; j++) {
        const d = steps[j]!.depth;
        if (d === childDepth && steps[j - 1] !== undefined && steps[j - 1]!.depth === frameDepth) {
          entry = j;
          break;
        }
        // Execution returned to (or above) the parent's caller before any
        // deeper step appeared → this child's callee ran no code.
        if (d < frameDepth) break;
      }

      if (entry >= 0) {
        map.set(child, entry);
        cursor = entry + 1;
        walk(child, childDepth, entry);
      } else {
        // Codeless callee (value transfer, precompile, EOA): no deeper step
        // exists, but the CALL-family op that invoked it does, at the parent's
        // depth. Map there so the row sorts in execution order and a click
        // lands on the call site — rather than collapsing to the parent's
        // entry (which sorts the row to the very top).
        let callSite = -1;
        for (let j = cursor; j < steps.length; j++) {
          const d = steps[j]!.depth;
          if (d < frameDepth) break;
          if (d === frameDepth && CALL_OPS.has(steps[j]!.op)) {
            callSite = j;
            break;
          }
        }
        const at = callSite >= 0 ? callSite : frameStep;
        if (callSite >= 0) cursor = callSite + 1;
        map.set(child, at);
        walk(child, childDepth, at);
      }
    }
  };

  walk(root, rootDepth, 0);
  return map;
}
