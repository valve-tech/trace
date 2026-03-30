import { useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

type DiffLineType = "context" | "added" | "removed";

interface DiffLine {
  type: DiffLineType;
  lineA: number | null;
  lineB: number | null;
  content: string;
}

interface FileDiff {
  filename: string;
  status: "changed" | "added" | "removed";
  lines: DiffLine[];
  linesAdded: number;
  linesRemoved: number;
}

interface DiffSummary {
  filesChanged: number;
  filesAdded: number;
  filesRemoved: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
}

interface DiffResult {
  contractA: { address: string; name: string | null };
  contractB: { address: string; name: string | null };
  files: FileDiff[];
  summary: DiffSummary;
}

interface DiffResponse {
  ok: boolean;
  diff?: DiffResult;
  error?: string;
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

async function fetchDiff(addressA: string, addressB: string): Promise<DiffResponse> {
  const res = await fetch("/api/diff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addressA, addressB }),
  });
  return (await res.json()) as DiffResponse;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FileDiffViewProps {
  file: FileDiff;
  isExpanded: boolean;
  onToggle: () => void;
}

function FileDiffView({ file, isExpanded, onToggle }: FileDiffViewProps) {
  const statusColor: Record<FileDiff["status"], string> = {
    changed: "var(--color-warning)",
    added: "var(--color-success)",
    removed: "var(--color-danger)",
  };

  const statusLabel: Record<FileDiff["status"], string> = {
    changed: "modified",
    added: "added",
    removed: "removed",
  };

  return (
    <div className="card" style={{ marginBottom: "1px" }}>
      {/* File header */}
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
          <span style={{ color: statusColor[file.status], fontWeight: 600, fontSize: "11px", textTransform: "uppercase", minWidth: "60px" }}>
            {statusLabel[file.status]}
          </span>
          <span style={{ color: "var(--color-text-primary)" }}>{file.filename}</span>
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

      {/* Diff lines */}
      {isExpanded && (
        <div
          style={{
            borderTop: "1px solid var(--color-border-default)",
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
              {file.lines.map((line, idx) => {
                let rowBg = "transparent";
                let textColor = "var(--color-text-secondary)";

                if (line.type === "added") {
                  rowBg = "var(--color-success-muted)";
                  textColor = "var(--color-text-primary)";
                } else if (line.type === "removed") {
                  rowBg = "var(--color-danger-muted)";
                  textColor = "var(--color-text-primary)";
                }

                const prefix =
                  line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";

                return (
                  <tr key={idx} style={{ backgroundColor: rowBg }}>
                    {/* Line number A */}
                    <td
                      style={{
                        padding: "0 8px",
                        textAlign: "right",
                        color: "var(--color-text-muted)",
                        userSelect: "none",
                        borderRight: "1px solid var(--color-border-muted)",
                        whiteSpace: "nowrap",
                        lineHeight: "1.6",
                      }}
                    >
                      {line.lineA ?? ""}
                    </td>
                    {/* Line number B */}
                    <td
                      style={{
                        padding: "0 8px",
                        textAlign: "right",
                        color: "var(--color-text-muted)",
                        userSelect: "none",
                        borderRight: "1px solid var(--color-border-muted)",
                        whiteSpace: "nowrap",
                        lineHeight: "1.6",
                      }}
                    >
                      {line.lineB ?? ""}
                    </td>
                    {/* Content */}
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
                          color:
                            line.type === "added"
                              ? "var(--color-success)"
                              : line.type === "removed"
                              ? "var(--color-danger)"
                              : "var(--color-text-muted)",
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
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ContractDiff() {
  const [addressA, setAddressA] = useState("");
  const [addressB, setAddressB] = useState("");
  const [result, setResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const isValidA = ADDRESS_RE.test(addressA);
  const isValidB = ADDRESS_RE.test(addressB);
  const canCompare = isValidA && isValidB && addressA.toLowerCase() !== addressB.toLowerCase();

  const handleCompare = useCallback(async () => {
    if (!canCompare) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setExpandedFiles(new Set());

    try {
      const response = await fetchDiff(addressA, addressB);
      if (!response.ok || !response.diff) {
        setError(response.error ?? "Unknown error");
        return;
      }
      setResult(response.diff);
      // Auto-expand all files that have changes
      setExpandedFiles(new Set(response.diff.files.map((f) => f.filename)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [canCompare, addressA, addressB]);

  const toggleFile = useCallback((filename: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  }, []);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--color-bg-input)",
    border: "1px solid var(--color-border-default)",
    color: "var(--color-text-primary)",
    padding: "8px 12px",
    fontSize: "13px",
    fontFamily: "var(--font-mono)",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--color-text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    display: "block",
    marginBottom: "6px",
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Input card */}
      <div className="card" style={{ marginBottom: "20px" }}>
        {/* Card header */}
        <div
          className="card-divider"
          style={{
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--color-text-primary)",
            }}
          >
            Contract Diff
          </span>
          <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>
            Compare verified source code between two contracts
          </span>
        </div>

        {/* Inputs */}
        <div
          style={{
            padding: "20px 16px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
            alignItems: "end",
          }}
        >
          <div>
            <label style={labelStyle}>Contract A</label>
            <input
              type="text"
              placeholder="0x..."
              value={addressA}
              onChange={(e) => setAddressA(e.target.value.trim())}
              style={{
                ...inputStyle,
                borderColor:
                  addressA && !isValidA
                    ? "var(--color-danger)"
                    : "var(--color-border-default)",
              }}
            />
            {addressA && !isValidA && (
              <div style={{ color: "var(--color-danger)", fontSize: "11px", marginTop: "4px" }}>
                Invalid address
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Contract B</label>
            <input
              type="text"
              placeholder="0x..."
              value={addressB}
              onChange={(e) => setAddressB(e.target.value.trim())}
              style={{
                ...inputStyle,
                borderColor:
                  addressB && !isValidB
                    ? "var(--color-danger)"
                    : "var(--color-border-default)",
              }}
            />
            {addressB && !isValidB && (
              <div style={{ color: "var(--color-danger)", fontSize: "11px", marginTop: "4px" }}>
                Invalid address
              </div>
            )}
          </div>
        </div>

        {/* Action row */}
        <div
          style={{
            padding: "0 16px 20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <button
            onClick={() => void handleCompare()}
            disabled={!canCompare || loading}
            style={{
              padding: "8px 20px",
              background: canCompare && !loading ? "var(--color-accent)" : "var(--color-bg-tertiary)",
              color: canCompare && !loading ? "#fff" : "var(--color-text-muted)",
              border: "none",
              cursor: canCompare && !loading ? "pointer" : "not-allowed",
              fontWeight: 600,
              fontSize: "13px",
              transition: "background 0.15s",
            }}
          >
            {loading ? "Comparing…" : "Compare"}
          </button>

          {isValidA && isValidB && addressA.toLowerCase() === addressB.toLowerCase() && (
            <span style={{ color: "var(--color-warning)", fontSize: "12px" }}>
              Addresses must be different
            </span>
          )}

          {loading && <div className="spinner" />}
        </div>
      </div>

      {/* Error state */}
      {error !== null && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--color-danger-muted)",
            border: "1px solid var(--color-danger)",
            color: "var(--color-danger)",
            fontSize: "13px",
            marginBottom: "20px",
          }}
        >
          {error}
        </div>
      )}

      {/* Results */}
      {result !== null && (
        <>
          {/* Summary bar */}
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
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                Comparing
              </span>
              <code style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}>
                {result.contractA.name ?? shortAddr(result.contractA.address)}
              </code>
              <span style={{ color: "var(--color-text-muted)" }}>vs</span>
              <code style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}>
                {result.contractB.name ?? shortAddr(result.contractB.address)}
              </code>
            </div>

            <div style={{ display: "flex", gap: "16px", marginLeft: "auto", flexWrap: "wrap" }}>
              {result.summary.filesChanged > 0 && (
                <span style={{ color: "var(--color-warning)", fontSize: "13px" }}>
                  {result.summary.filesChanged} file{result.summary.filesChanged !== 1 ? "s" : ""} changed
                </span>
              )}
              {result.summary.filesAdded > 0 && (
                <span style={{ color: "var(--color-success)", fontSize: "13px" }}>
                  +{result.summary.filesAdded} added
                </span>
              )}
              {result.summary.filesRemoved > 0 && (
                <span style={{ color: "var(--color-danger)", fontSize: "13px" }}>
                  -{result.summary.filesRemoved} removed
                </span>
              )}
              <span style={{ color: "var(--color-success)", fontSize: "13px", fontFamily: "var(--font-mono)" }}>
                +{result.summary.totalLinesAdded}
              </span>
              <span style={{ color: "var(--color-danger)", fontSize: "13px", fontFamily: "var(--font-mono)" }}>
                -{result.summary.totalLinesRemoved}
              </span>
            </div>
          </div>

          {/* No differences */}
          {result.files.length === 0 && (
            <div
              className="card"
              style={{
                padding: "32px 16px",
                textAlign: "center",
                color: "var(--color-text-secondary)",
                fontSize: "14px",
              }}
            >
              No source code differences found between these contracts.
            </div>
          )}

          {/* File diffs */}
          {result.files.map((file) => (
            <FileDiffView
              key={file.filename}
              file={file}
              isExpanded={expandedFiles.has(file.filename)}
              onToggle={() => toggleFile(file.filename)}
            />
          ))}
        </>
      )}
    </div>
  );
}
