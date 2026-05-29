export type DebugTab = "debugger" | "calltree" | "gas" | "opcodes";

interface TabDef {
  key: DebugTab;
  label: string;
  count: number;
}

/** Tab row above the debugger's main content area. Shows a badge on tabs
 *  with countable data (step count for Debugger + Opcodes). */
export function Tabs({
  activeTab,
  setActiveTab,
  opcodeStepCount,
  hasCallTrace,
  hasGasProfile,
}: {
  activeTab: DebugTab;
  setActiveTab: (t: DebugTab) => void;
  opcodeStepCount: number;
  hasCallTrace: boolean;
  hasGasProfile: boolean;
}) {
  const tabs: TabDef[] = [
    { key: "debugger", label: "Step Debugger", count: opcodeStepCount },
    { key: "calltree", label: "Call Tree", count: hasCallTrace ? 1 : 0 },
    { key: "gas", label: "Gas Profile", count: hasGasProfile ? 1 : 0 },
    { key: "opcodes", label: "Opcodes", count: opcodeStepCount },
  ];

  return (
    <div
      className="bs-b flex"
      style={{}}
    >
      {tabs.map(({ key, label, count }) => (
        <button
          key={key}
          onClick={() => setActiveTab(key)}
          className="px-4 py-3 text-sm font-medium transition-colors"
          style={{
            boxShadow:
              activeTab === key
                ? "0 2px 0 0 var(--color-accent)"
                : "0 2px 0 0 transparent",
            color:
              activeTab === key
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
            backgroundColor: "transparent",
          }}
        >
          {label}
          {count > 0 && (key === "opcodes" || key === "debugger") && (
            <span
              className="ml-2 text-xs px-1.5 py-0.5 rounded theme-accent-bg theme-accent"
            >
              {count.toLocaleString()}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
