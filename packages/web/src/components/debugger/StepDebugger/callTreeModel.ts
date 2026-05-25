import type { CallFrame, OpcodeStep } from "../../../api/debugger";

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
        map.set(child, frameStep);
        walk(child, childDepth, frameStep);
      }
    }
  };

  walk(root, rootDepth, 0);
  return map;
}
