import { useState } from "react";
import { destroyFork } from "../../../api/testnets";

interface Props {
  forkId: string;
  onDestroyed: () => void;
}

export function DestroyPanel({ forkId, onDestroyed }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDestroy = async () => {
    setLoading(true);
    try {
      await destroyFork(forkId);
      onDestroyed();
    } catch {
      setLoading(false);
    }
  };

  return (
    <div
      className="pt-2"
      style={{ boxShadow: "0 -1px 0 0 var(--color-border-muted)" }}
    >
      {!confirm ? (
        <button
          onClick={() => setConfirm(true)}
          className="px-3 py-1.5 text-xs rounded"
          style={{
            boxShadow: "0 0 0 1px var(--color-danger)",
            color: "var(--color-danger)",
            backgroundColor: "transparent",
          }}
        >
          Destroy TestNet
        </button>
      ) : (
        <div className="flex items-center gap-inline">
          <span
            className="text-xs theme-danger"
          >
            Are you sure? This cannot be undone.
          </span>
          <button
            onClick={handleDestroy}
            disabled={loading}
            className="px-3 py-1.5 text-xs rounded font-medium text-white"
            style={{
              backgroundColor: "var(--color-danger)",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Destroying..." : "Yes, Destroy"}
          </button>
          <button
            onClick={() => setConfirm(false)}
            className="px-3 py-1.5 text-xs rounded"
            style={{
              boxShadow: "0 0 0 1px var(--color-border-default)",
              color: "var(--color-text-secondary)",
              backgroundColor: "transparent",
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
