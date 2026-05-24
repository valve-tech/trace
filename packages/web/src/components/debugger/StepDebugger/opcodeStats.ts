import type { OpcodeStep } from "../../../api/debugger";

export interface OpcodeFrequency {
  op: string;
  /** How many times this opcode executes in the trace. */
  count: number;
  /** Total gas attributed to this opcode across the trace. */
  gas: number;
}

/**
 * Aggregate an opcode-level trace into per-opcode frequencies, sorted by count
 * descending (ties broken alphabetically for stable ordering). Surfaces which
 * opcodes recur — the hot, repeated operations — and powers the filter tags.
 */
export function opcodeFrequencies(steps: OpcodeStep[]): OpcodeFrequency[] {
  const map = new Map<string, { count: number; gas: number }>();
  for (const s of steps) {
    const cur = map.get(s.op) ?? { count: 0, gas: 0 };
    cur.count += 1;
    cur.gas += s.gasCost;
    map.set(s.op, cur);
  }
  return [...map.entries()]
    .map(([op, v]) => ({ op, count: v.count, gas: v.gas }))
    .sort((a, b) => b.count - a.count || a.op.localeCompare(b.op));
}
