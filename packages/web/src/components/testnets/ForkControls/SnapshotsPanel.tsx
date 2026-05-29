import { useState } from "react";
import { revertSnapshot, takeSnapshot } from "../../../api/testnets";
import { msgColor, sectionStyle } from "./styles";

interface SnapshotEntry {
  id: string;
  takenAt: string;
}

interface Props {
  forkId: string;
  onReverted: () => void;
}

export function SnapshotsPanel({ forkId, onReverted }: Props) {
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleSnapshot = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const snapId = await takeSnapshot(forkId);
      setSnapshots((prev) => [
        ...prev,
        { id: snapId, takenAt: new Date().toLocaleTimeString() },
      ]);
      setMsg(`Snapshot created: ${snapId}`);
    } catch (err) {
      setMsg(
        `Error: ${err instanceof Error ? err.message : "Failed to snapshot"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = async (snapshotId: string) => {
    setLoading(true);
    setMsg(null);
    try {
      await revertSnapshot(forkId, snapshotId);
      setMsg(`Reverted to snapshot ${snapshotId}`);
      onReverted();
    } catch (err) {
      setMsg(
        `Error: ${err instanceof Error ? err.message : "Failed to revert"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-md p-3" style={sectionStyle}>
      <div className="flex items-center justify-between mb-1.5">
        <label
          className="text-xs font-medium theme-text-secondary"
        >
          Snapshots
        </label>
        <button
          onClick={handleSnapshot}
          disabled={loading}
          className="px-3 py-1 text-xs rounded font-medium text-white"
          style={{
            backgroundColor: loading
              ? "var(--color-accent-muted)"
              : "var(--color-accent)",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Taking..." : "Take Snapshot"}
        </button>
      </div>

      {snapshots.length > 0 && (
        <div className="space-y-1 mt-2">
          {snapshots.map((snap) => (
            <div
              key={snap.id}
              className="flex items-center justify-between text-xs px-2 py-1.5 rounded bs"
              style={{
                backgroundColor: "var(--color-bg-input)",
              }}
            >
              <span style={{ color: "var(--color-text-secondary)" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  {snap.id}
                </span>
                <span className="ml-2">at {snap.takenAt}</span>
              </span>
              <button
                onClick={() => handleRevert(snap.id)}
                disabled={loading}
                className="px-2 py-0.5 rounded text-xs"
                style={{
                  backgroundColor: "var(--color-warning-muted)",
                  color: "var(--color-warning)",
                }}
              >
                Revert
              </button>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <p className="text-xs mt-1.5" style={{ color: msgColor(msg) }}>
          {msg}
        </p>
      )}
    </div>
  );
}
