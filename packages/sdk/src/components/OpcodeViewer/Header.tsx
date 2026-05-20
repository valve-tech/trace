export function Header({
  totalSteps,
  filteredCount,
  filterOp,
  onFilterChange,
  className,
  inputClassName,
}: {
  totalSteps: number;
  filteredCount: number;
  filterOp: string;
  onFilterChange: (v: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 16,
        borderBottom: "1px solid rgba(139, 148, 158, 0.2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 600,
            margin: 0,
            color: "#c9d1d9",
          }}
        >
          Opcode Trace
        </h3>
        <span style={{ fontSize: 11, color: "#8b949e" }}>
          {filteredCount.toLocaleString()} steps
          {filterOp && ` (filtered from ${totalSteps.toLocaleString()})`}
        </span>
      </div>
      <input
        type="text"
        placeholder="Filter opcodes..."
        value={filterOp}
        onChange={(e) => onFilterChange(e.target.value)}
        className={inputClassName}
        aria-label="Filter opcodes"
        style={{
          padding: "6px 12px",
          borderRadius: 4,
          border: "1px solid rgba(139, 148, 158, 0.3)",
          backgroundColor: "rgba(0, 0, 0, 0.2)",
          color: "#c9d1d9",
          fontFamily: "monospace",
          fontSize: 11,
          width: 160,
        }}
      />
    </div>
  );
}
