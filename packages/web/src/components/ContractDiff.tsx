import { useCallback, useState } from "react";
import type { DiffResult } from "./ContractDiff/types";
import { fetchDiff } from "./ContractDiff/api";
import { InputCard } from "./ContractDiff/InputCard";
import { SummaryBar } from "./ContractDiff/SummaryBar";
import { FileDiffView } from "./ContractDiff/FileDiffView";

export default function ContractDiff() {
  const [addressA, setAddressA] = useState("");
  const [addressB, setAddressB] = useState("");
  const [result, setResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const handleCompare = useCallback(async () => {
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
      setExpandedFiles(new Set(response.diff.files.map((f) => f.filename)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [addressA, addressB]);

  const toggleFile = useCallback((filename: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }, []);

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <InputCard
        addressA={addressA}
        setAddressA={setAddressA}
        addressB={addressB}
        setAddressB={setAddressB}
        loading={loading}
        onCompare={() => void handleCompare()}
      />

      {error !== null && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--color-danger-muted)",
            boxShadow: "0 0 0 1px var(--color-danger)",
            color: "var(--color-danger)",
            fontSize: "13px",
            marginBottom: "20px",
          }}
        >
          {error}
        </div>
      )}

      {result !== null && (
        <>
          <SummaryBar result={result} />

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
