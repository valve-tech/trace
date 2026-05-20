import type { OpcodeStep } from "../../types.js";

export function MemoryPanel({ step }: { step: OpcodeStep }) {
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
        Memory ({step.memory.length} words):
      </span>
      <div
        style={{
          padding: 8,
          borderRadius: 4,
          fontFamily: "monospace",
          maxHeight: 96,
          overflowY: "auto",
          color: "#c9d1d9",
          backgroundColor: "rgba(139, 148, 158, 0.08)",
          fontSize: 10,
        }}
      >
        {step.memory.slice(0, 16).map((word, i) => (
          <div key={i} style={{ display: "flex", gap: 8 }}>
            <span
              style={{
                width: 40,
                flexShrink: 0,
                textAlign: "right",
                color: "#6e7681",
              }}
            >
              0x{(i * 32).toString(16).padStart(4, "0")}
            </span>
            <span style={{ wordBreak: "break-all" }}>{word}</span>
          </div>
        ))}
        {step.memory.length > 16 && (
          <div style={{ color: "#6e7681" }}>
            ... {step.memory.length - 16} more words
          </div>
        )}
      </div>
    </div>
  );
}
