import { useState } from "react";
import { mineBlocks } from "../../../api/testnets";
import { inputStyle, msgColor, sectionStyle } from "./styles";

interface Props {
  forkId: string;
  onMined: () => void;
}

export function MineBlocksPanel({ forkId, onMined }: Props) {
  const [count, setCount] = useState("1");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleMine = async () => {
    const n = parseInt(count, 10);
    if (isNaN(n) || n < 1) return;
    setLoading(true);
    setMsg(null);
    try {
      await mineBlocks(forkId, n);
      setMsg(`Mined ${n} block${n > 1 ? "s" : ""}`);
      onMined();
    } catch (err) {
      setMsg(
        `Error: ${err instanceof Error ? err.message : "Failed to mine blocks"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-md border p-3" style={sectionStyle}>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Mine Blocks
      </label>
      <div className="flex gap-2">
        <input
          type="number"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          placeholder="Count"
          min={1}
          max={1000}
          className="flex-1 px-2 py-1.5 rounded border text-sm"
          style={inputStyle}
        />
        <button
          onClick={handleMine}
          disabled={loading}
          className="px-3 py-1.5 text-xs rounded font-medium text-white whitespace-nowrap"
          style={{
            backgroundColor: loading
              ? "var(--color-accent-muted)"
              : "var(--color-accent)",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Mining..." : "Mine"}
        </button>
      </div>
      {msg && (
        <p className="text-xs mt-1" style={{ color: msgColor(msg) }}>
          {msg}
        </p>
      )}
    </div>
  );
}
