import type { DiffResult } from "./types";
import { shortAddr } from "./api";

export function SummaryBar({ result }: { result: DiffResult }) {
  const { summary } = result;
  return (
    <div
      className="card"
      style={{
        padding: "12px 16px",
        marginBottom: "16px",
        display: "flex",
        alignItems: "center",
        gap: "20px",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            fontSize: "12px",
            color: "var(--color-text-secondary)",
          }}
        >
          Comparing
        </span>
        <code
          style={{
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            color: "var(--color-accent)",
          }}
        >
          {result.contractA.name ?? shortAddr(result.contractA.address)}
        </code>
        <span style={{ color: "var(--color-text-muted)" }}>vs</span>
        <code
          style={{
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            color: "var(--color-accent)",
          }}
        >
          {result.contractB.name ?? shortAddr(result.contractB.address)}
        </code>
      </div>

      <div
        style={{
          display: "flex",
          gap: "16px",
          marginLeft: "auto",
          flexWrap: "wrap",
        }}
      >
        {summary.filesChanged > 0 && (
          <span style={{ color: "var(--color-warning)", fontSize: "13px" }}>
            {summary.filesChanged} file{summary.filesChanged !== 1 ? "s" : ""}{" "}
            changed
          </span>
        )}
        {summary.filesAdded > 0 && (
          <span style={{ color: "var(--color-success)", fontSize: "13px" }}>
            +{summary.filesAdded} added
          </span>
        )}
        {summary.filesRemoved > 0 && (
          <span style={{ color: "var(--color-danger)", fontSize: "13px" }}>
            -{summary.filesRemoved} removed
          </span>
        )}
        <span
          style={{
            color: "var(--color-success)",
            fontSize: "13px",
            fontFamily: "var(--font-mono)",
          }}
        >
          +{summary.totalLinesAdded}
        </span>
        <span
          style={{
            color: "var(--color-danger)",
            fontSize: "13px",
            fontFamily: "var(--font-mono)",
          }}
        >
          -{summary.totalLinesRemoved}
        </span>
      </div>
    </div>
  );
}
