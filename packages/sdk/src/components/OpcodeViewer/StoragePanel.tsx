import type { OpcodeStep } from "../../types.js";

export function StoragePanel({ step }: { step: OpcodeStep }) {
  return (
    <div>
      <span
        style={{
          fontWeight: 500,
          display: "block",
          marginBottom: 4,
          color: "#8b949e",
        }}
      >
        Storage changes:
      </span>
      <div
        style={{
          padding: 8,
          borderRadius: 4,
          fontFamily: "monospace",
          maxHeight: 96,
          overflowY: "auto",
          backgroundColor: "rgba(139, 148, 158, 0.08)",
          fontSize: 10,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {Object.entries(step.storage).map(([slot, value]) => (
          <div key={slot} style={{ display: "flex", gap: 8 }}>
            <span style={{ color: "#eab308" }}>{slot}</span>
            <span style={{ color: "#6e7681" }}>=&gt;</span>
            <span style={{ wordBreak: "break-all", color: "#c9d1d9" }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
