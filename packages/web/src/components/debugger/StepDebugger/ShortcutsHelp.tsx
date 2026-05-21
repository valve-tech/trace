import { Shortcut } from "./Shortcut";

/** Inline help bar at the bottom of the debugger listing all keyboard shortcuts. */
export function ShortcutsHelp() {
  return (
    <div
      className="flex flex-wrap gap-4 px-4 py-2 card text-xs"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
        color: "var(--color-text-muted)",
      }}
    >
      <Shortcut keys="← →" label="Step" />
      <Shortcut keys="Space" label="Forward" />
      <Shortcut keys="Home/End" label="Jump" />
      <Shortcut keys="C" label="Next CALL" />
      <Shortcut keys="S" label="Next SSTORE" />
      <Shortcut keys="L" label="Next LOG" />
    </div>
  );
}
