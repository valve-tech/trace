import type { TraceFrame } from "../../types.js";
import { formatGas } from "../formatters.js";

export function DetailPanel({
  frame,
  className,
}: {
  frame: TraceFrame;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        margin: "0 0 8px 28px",
        padding: 12,
        borderRadius: 8,
        fontSize: 11,
        backgroundColor: "rgba(139, 148, 158, 0.05)",
        border: "1px solid rgba(139, 148, 158, 0.2)",
        color: "#c9d1d9",
      }}
    >
      <DetailRow label="Type" value={frame.type} />
      <DetailRow label="From" value={frame.from} mono />
      <DetailRow label="To" value={frame.to ?? "(contract creation)"} mono />
      <DetailRow label="Gas" value={formatGas(frame.gas)} />
      <DetailRow label="Gas Used" value={formatGas(frame.gasUsed)} />
      {frame.value > 0n && (
        <DetailRow label="Value" value={frame.value.toString()} mono />
      )}
      {frame.input && frame.input !== "0x" && (
        <DataBlock label="Input" value={frame.input} />
      )}
      {frame.output && frame.output !== "0x" && (
        <DataBlock label="Output" value={frame.output} />
      )}
      {frame.revertReason && (
        <DetailRow label="Revert" value={frame.revertReason} danger />
      )}
      {frame.error && !frame.revertReason && (
        <DetailRow label="Error" value={frame.error} danger />
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
  danger = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
      <span
        style={{
          fontWeight: 500,
          flexShrink: 0,
          width: 80,
          color: "#8b949e",
        }}
      >
        {label}:
      </span>
      <span
        style={{
          wordBreak: "break-all",
          fontFamily: mono ? "monospace" : "inherit",
          color: danger ? "#ef4444" : "inherit",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function DataBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontWeight: 500, marginBottom: 4, color: "#8b949e" }}>
        {label}:
      </div>
      <div
        style={{
          padding: 8,
          borderRadius: 4,
          wordBreak: "break-all",
          fontFamily: "monospace",
          maxHeight: 128,
          overflowY: "auto",
          fontSize: 10,
          backgroundColor: "rgba(0, 0, 0, 0.2)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
