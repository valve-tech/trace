import type { OpcodeStep } from "../../types.js";

export function StackPanel({ step }: { step: OpcodeStep }) {
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
        Stack ({step.stack.length} items):
      </span>
      <div
        style={{
          padding: 8,
          borderRadius: 4,
          fontFamily: "monospace",
          maxHeight: 128,
          overflowY: "auto",
          backgroundColor: "rgba(139, 148, 158, 0.08)",
          fontSize: 10,
        }}
      >
        {step.stack
          .slice()
          .reverse()
          .map((val, i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <span
                style={{
                  width: 24,
                  flexShrink: 0,
                  textAlign: "right",
                  color: "#6e7681",
                }}
              >
                {step.stack.length - 1 - i}
              </span>
              <span style={{ wordBreak: "break-all", color: "#c9d1d9" }}>
                {val}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
