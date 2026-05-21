import type { TraceFrame } from "../../types.js";

export function countFrames(frame: TraceFrame): number {
  let count = 0;
  const stack: TraceFrame[] = [frame];
  while (stack.length > 0) {
    const f = stack.pop()!;
    count++;
    for (const c of f.children) stack.push(c);
  }
  return count;
}
