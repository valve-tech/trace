import type { useOpcodeNavigation } from "../../hooks/useOpcodeNavigation.js";
import { getOpcodeColor, isExpensiveOp } from "../opcodeClassify.js";

export function Header({
  nav,
  empty,
  className,
}: {
  nav: ReturnType<typeof useOpcodeNavigation>;
  empty: boolean;
  className?: string;
}) {
  const step = nav.step;
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 16,
        borderBottom: "1px solid rgba(139, 148, 158, 0.2)",
        gap: 12,
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
          Step Debugger
        </h3>
        <span style={{ fontSize: 11, color: "#8b949e" }}>
          {empty ? "0 / 0" : `${nav.currentIndex + 1} / ${nav.totalSteps}`}
        </span>
      </div>
      {step && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Badge label="PC" value={step.pc.toString()} />
          <Badge
            label="OP"
            value={step.op}
            valueColor={getOpcodeColor(step.op)}
            highlight={isExpensiveOp(step.op)}
          />
          <Badge label="Gas" value={step.gas.toLocaleString()} />
          <Badge label="Depth" value={step.depth.toString()} />
        </div>
      )}
    </div>
  );
}

function Badge({
  label,
  value,
  valueColor = "#c9d1d9",
  highlight = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  highlight?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontFamily: "monospace",
      }}
    >
      <span style={{ color: "#6e7681" }}>{label}</span>
      <span style={{ color: valueColor, fontWeight: 600 }}>{value}</span>
      {highlight && (
        <span
          title="Expensive operation"
          aria-label="Expensive operation"
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "#ef4444",
          }}
        />
      )}
    </span>
  );
}
