import type { FileDiff } from "./types";

const STATUS_COLOR: Record<FileDiff["status"], string> = {
  changed: "var(--color-warning)",
  added: "var(--color-success)",
  removed: "var(--color-danger)",
};

const STATUS_LABEL: Record<FileDiff["status"], string> = {
  changed: "modified",
  added: "added",
  removed: "removed",
};

interface Props {
  file: FileDiff;
  isExpanded: boolean;
  onToggle: () => void;
}

export function FileDiffView({ file, isExpanded, onToggle }: Props) {
  return (
    <div className="card" style={{ marginBottom: "1px" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              color: STATUS_COLOR[file.status],
              fontWeight: 600,
              fontSize: "11px",
              textTransform: "uppercase",
              minWidth: "60px",
            }}
          >
            {STATUS_LABEL[file.status]}
          </span>
          <span style={{ color: "var(--color-text-primary)" }}>
            {file.filename}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {file.linesAdded > 0 && (
            <span style={{ color: "var(--color-success)", fontSize: "12px" }}>
              +{file.linesAdded}
            </span>
          )}
          {file.linesRemoved > 0 && (
            <span style={{ color: "var(--color-danger)", fontSize: "12px" }}>
              -{file.linesRemoved}
            </span>
          )}
          <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>
            {isExpanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {isExpanded && <DiffTable lines={file.lines} />}
    </div>
  );
}

function DiffTable({ lines }: { lines: FileDiff["lines"] }) {
  return (
    <div
      style={{
        boxShadow: "0 -1px 0 0 var(--color-border-default)",
        overflowX: "auto",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: "52px" }} />
          <col style={{ width: "52px" }} />
          <col />
        </colgroup>
        <tbody>
          {lines.map((line, idx) => {
            const rowBg =
              line.type === "added"
                ? "var(--color-success-muted)"
                : line.type === "removed"
                  ? "var(--color-danger-muted)"
                  : "transparent";
            const textColor =
              line.type === "context"
                ? "var(--color-text-secondary)"
                : "var(--color-text-primary)";
            const prefix =
              line.type === "added"
                ? "+"
                : line.type === "removed"
                  ? "-"
                  : " ";
            const prefixColor =
              line.type === "added"
                ? "var(--color-success)"
                : line.type === "removed"
                  ? "var(--color-danger)"
                  : "var(--color-text-muted)";

            return (
              <tr key={idx} style={{ backgroundColor: rowBg }}>
                <LineNumberCell value={line.lineA} />
                <LineNumberCell value={line.lineB} />
                <td
                  style={{
                    padding: "0 12px",
                    color: textColor,
                    whiteSpace: "pre",
                    lineHeight: "1.6",
                  }}
                >
                  <span
                    style={{
                      color: prefixColor,
                      marginRight: "8px",
                      userSelect: "none",
                    }}
                  >
                    {prefix}
                  </span>
                  {line.content}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LineNumberCell({ value }: { value: number | null }) {
  return (
    <td
      style={{
        padding: "0 8px",
        textAlign: "right",
        color: "var(--color-text-muted)",
        userSelect: "none",
        boxShadow: "1px 0 0 0 var(--color-border-muted)",
        whiteSpace: "nowrap",
        lineHeight: "1.6",
      }}
    >
      {value ?? ""}
    </td>
  );
}
