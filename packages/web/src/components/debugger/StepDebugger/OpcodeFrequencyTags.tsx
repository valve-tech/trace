import { getOpcodeColor } from "@valve-tech/trace-sdk";
import type { OpcodeFrequency } from "./opcodeStats";

/**
 * Filter rail of per-opcode frequency tags (opcode + occurrence count), sorted
 * by how often each recurs. Clicking a tag toggles an exact-match filter on the
 * trace; pair with the "next match" control to walk every occurrence.
 */
export function OpcodeFrequencyTags({
  frequencies,
  activeOp,
  onToggle,
}: {
  frequencies: OpcodeFrequency[];
  activeOp: string;
  onToggle: (op: string) => void;
}) {
  if (frequencies.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-tight p-2"
      style={{ boxShadow: "0 1px 0 0 var(--color-border-muted)" }}
    >
      {frequencies.map((f) => {
        const active = f.op === activeOp;
        const color = getOpcodeColor(f.op);
        return (
          <button
            key={f.op}
            type="button"
            onClick={() => onToggle(f.op)}
            aria-pressed={active}
            title={`${f.op} — ${f.count} occurrence${f.count === 1 ? "" : "s"}`}
            className="inline-flex items-center gap-tight text-[10px] font-mono px-1.5 py-0.5 transition-colors"
            style={{
              color: active ? "#fff" : color,
              backgroundColor: active ? color : `${color}20`,
              boxShadow: `inset 0 0 0 1px ${color}${active ? "" : "40"}`,
            }}
          >
            <span className="font-semibold">{f.op}</span>
            <span style={{ opacity: 0.85 }}>{f.count}</span>
          </button>
        );
      })}
    </div>
  );
}
