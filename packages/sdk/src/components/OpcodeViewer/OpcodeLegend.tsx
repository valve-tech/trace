const ITEMS: Array<{ label: string; color: string }> = [
  { label: "Stack", color: "#6366f1" },
  { label: "Memory", color: "#22c55e" },
  { label: "Storage", color: "#f97316" },
  { label: "Calls", color: "#ef4444" },
  { label: "Logging", color: "#eab308" },
  { label: "Hash", color: "#06b6d4" },
  { label: "Control", color: "#64748b" },
];

export function OpcodeLegend({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{
        padding: "8px 16px",
        borderBottom: "1px solid rgba(139, 148, 158, 0.1)",
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      {ITEMS.map(({ label, color }) => (
        <div
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: color,
            }}
          />
          <span style={{ color: "#8b949e" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
