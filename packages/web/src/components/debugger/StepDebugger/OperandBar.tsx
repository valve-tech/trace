import { getOpcodeColor } from "@valve-tech/trace-sdk";
import type { OperandInfo } from "./opcodeOperands";
import { truncateWord } from "./format";

/**
 * One-line readout of what the current opcode operates on: its operand
 * signature, the resolved input values pulled off the stack, and the memory
 * region / storage slot it touches. This is the "what's participating in this
 * opcode" summary that ties the Stack/Memory/Storage panels together.
 */
export function OperandBar({ op, operands }: { op: string; operands: OperandInfo | null }) {
  return (
    <div
      className="card-divider px-3 py-1.5 text-xs flex items-center gap-row flex-wrap"
      style={{ backgroundColor: "var(--color-bg-secondary)", fontFamily: "var(--font-mono)" }}
    >
      <span className="font-semibold" style={{ color: getOpcodeColor(op) }}>{op}</span>

      {!operands && (
        <span style={{ color: "var(--color-text-muted)" }}>no modeled operands</span>
      )}

      {operands?.args.map((a) => (
        <span key={a.name} className="flex items-center gap-tight">
          <span style={{ color: "var(--color-text-muted)" }}>{a.name}</span>
          <span style={{ color: "var(--color-text-muted)" }}>=</span>
          <span title={a.value} style={{ color: "var(--color-text-primary)" }}>{truncateWord(a.value)}</span>
        </span>
      ))}

      {operands && operands.args.length === 0 && operands.outputs > 0 && (
        <span style={{ color: "var(--color-text-muted)" }}>→ pushes {operands.outputs}</span>
      )}

      {operands?.memory && operands.memory.size > 0 && (
        <span
          className="px-1.5 py-0.5"
          style={{
            color: operands.memory.kind === "write" ? "var(--color-warning)" : "var(--color-text-secondary)",
            boxShadow: `inset 0 0 0 1px ${operands.memory.kind === "write" ? "var(--color-warning)" : "var(--color-border-default)"}`,
          }}
          title={`mem ${operands.memory.kind}`}
        >
          mem {operands.memory.kind} [0x{operands.memory.offset.toString(16)} … +{operands.memory.size}]
        </span>
      )}

      {operands?.storageSlot && (
        <span
          className="px-1.5 py-0.5"
          style={{ color: "var(--color-warning)", boxShadow: "inset 0 0 0 1px var(--color-warning)" }}
          title="storage slot"
        >
          slot {truncateWord(operands.storageSlot)}
        </span>
      )}
    </div>
  );
}
