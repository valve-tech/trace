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
        <span className="theme-text-secondary" style={{ fontSize: "12px" }}>
          Comparing
        </span>
        <code className="theme-accent theme-mono" style={{ fontSize: "12px" }}>
          {result.contractA.name ?? shortAddr(result.contractA.address)}
        </code>
        <span className="theme-text-muted">vs</span>
        <code className="theme-accent theme-mono" style={{ fontSize: "12px" }}>
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
          <span className="theme-warning" style={{ fontSize: "13px" }}>
            {summary.filesChanged} file{summary.filesChanged !== 1 ? "s" : ""}{" "}
            changed
          </span>
        )}
        {summary.filesAdded > 0 && (
          <span className="theme-success" style={{ fontSize: "13px" }}>
            +{summary.filesAdded} added
          </span>
        )}
        {summary.filesRemoved > 0 && (
          <span className="theme-danger" style={{ fontSize: "13px" }}>
            -{summary.filesRemoved} removed
          </span>
        )}
        <span className="theme-success theme-mono" style={{ fontSize: "13px" }}>
          +{summary.totalLinesAdded}
        </span>
        <span className="theme-danger theme-mono" style={{ fontSize: "13px" }}>
          -{summary.totalLinesRemoved}
        </span>
      </div>
    </div>
  );
}
