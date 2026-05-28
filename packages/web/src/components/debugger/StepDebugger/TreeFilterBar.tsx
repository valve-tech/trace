import { useState } from "react";

/**
 * Opcodes offered as quick chips. State + transient + control-flow ops — the
 * high-signal ones worth locating in the tree. Any other opcode can be added by
 * name via the input, so this list is a convenience, not a limit.
 */
const COMMON_OPS = [
  "SSTORE", "SLOAD", "TSTORE", "TLOAD",
  "REVERT", "SELFDESTRUCT", "CREATE", "CREATE2",
  "MSTORE", "MLOAD", "KECCAK256",
];

/** A pill toggle styled with the project's outset/inset box-shadow borders. */
function Chip({ label, active, onClick, title }: {
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="text-[10px] font-semibold tracking-wide px-1.5 py-0.5 flex-shrink-0"
      style={{
        fontFamily: "var(--font-mono)",
        color: active ? "var(--color-accent)" : "var(--color-text-muted)",
        boxShadow: `inset 0 0 0 1px ${active ? "var(--color-accent)" : "var(--color-border-muted)"}`,
        backgroundColor: active ? "var(--color-accent-muted)" : "transparent",
      }}
    >
      {label}
    </button>
  );
}

/**
 * Filter chips above the call tree: toggle whole node kinds (functions, events)
 * and surface specific opcodes as leaves. Opcode chips that aren't in the
 * common list but are enabled (added via the input) are shown too, so the bar
 * always reflects exactly what's on.
 */
export function TreeFilterBar({
  functions,
  events,
  onToggleFunctions,
  onToggleEvents,
  enabledOps,
  onToggleOp,
}: {
  functions: boolean;
  events: boolean;
  onToggleFunctions: () => void;
  onToggleEvents: () => void;
  enabledOps: Set<string>;
  onToggleOp: (op: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const extraOps = [...enabledOps].filter((op) => !COMMON_OPS.includes(op)).sort();

  const addDraft = () => {
    const op = draft.trim().toUpperCase();
    if (op && !enabledOps.has(op)) onToggleOp(op);
    setDraft("");
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1 p-2"
      style={{ boxShadow: "0 1px 0 0 var(--color-border-default)" }}
    >
      <Chip label="ƒ functions" active={functions} onClick={onToggleFunctions} title="Internal/library functions" />
      <Chip label="◈ events" active={events} onClick={onToggleEvents} title="Emitted events (LOG)" />
      <span className="mx-1 self-stretch" style={{ width: 1, boxShadow: "inset 1px 0 0 0 var(--color-border-muted)" }} />
      {COMMON_OPS.map((op) => (
        <Chip key={op} label={op} active={enabledOps.has(op)} onClick={() => onToggleOp(op)} />
      ))}
      {extraOps.map((op) => (
        <Chip key={op} label={op} active onClick={() => onToggleOp(op)} title="Remove" />
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraft(); } }}
        placeholder="+ opcode"
        spellCheck={false}
        className="text-[10px] px-1.5 py-0.5 w-20 flex-shrink-0"
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--color-text-primary)",
          backgroundColor: "transparent",
          boxShadow: "inset 0 0 0 1px var(--color-border-muted)",
          outline: "none",
        }}
      />
    </div>
  );
}
