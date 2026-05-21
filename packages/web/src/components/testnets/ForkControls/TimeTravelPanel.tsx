import { useState } from "react";
import { timeTravel } from "../../../api/testnets";
import { inputStyle, msgColor, sectionStyle } from "./styles";

function formatSeconds(s: number): string {
  if (s >= 3600) {
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }
  if (s >= 60) {
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }
  return `${s}s`;
}

interface Props {
  forkId: string;
  onAdvanced: () => void;
}

export function TimeTravelPanel({ forkId, onAdvanced }: Props) {
  const [seconds, setSeconds] = useState("3600");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleTimeTravel = async () => {
    const secs = parseInt(seconds, 10);
    if (isNaN(secs) || secs < 1) return;
    setLoading(true);
    setMsg(null);
    try {
      await timeTravel(forkId, secs);
      setMsg(`Advanced time by ${secs.toLocaleString()} seconds`);
      onAdvanced();
    } catch (err) {
      setMsg(
        `Error: ${err instanceof Error ? err.message : "Failed to time travel"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const parsed = parseInt(seconds, 10);
  const previewText = isNaN(parsed) ? seconds : formatSeconds(parsed);

  return (
    <div className="rounded-md border p-3" style={sectionStyle}>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Time Travel
      </label>
      <div className="flex gap-2">
        <input
          type="number"
          value={seconds}
          onChange={(e) => setSeconds(e.target.value)}
          placeholder="Seconds"
          min={1}
          className="flex-1 px-2 py-1.5 rounded border text-sm"
          style={inputStyle}
        />
        <button
          onClick={handleTimeTravel}
          disabled={loading}
          className="px-3 py-1.5 text-xs rounded font-medium text-white whitespace-nowrap"
          style={{
            backgroundColor: loading
              ? "var(--color-accent-muted)"
              : "var(--color-accent)",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "..." : "Travel"}
        </button>
      </div>
      <p
        className="text-xs mt-1"
        style={{ color: "var(--color-text-muted)" }}
      >
        Advance {previewText}
      </p>
      {msg && (
        <p className="text-xs mt-1" style={{ color: msgColor(msg) }}>
          {msg}
        </p>
      )}
    </div>
  );
}
