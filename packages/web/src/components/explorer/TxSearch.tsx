import { useState } from "react";

export type SearchTarget =
  | { type: "tx"; value: string }
  | { type: "address"; value: string }
  | { type: "block"; value: string };

interface TxSearchProps {
  onSearch: (target: SearchTarget) => void;
  loading?: boolean;
}

function detectInputType(input: string): SearchTarget | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Transaction hash: 0x + 64 hex chars = 66 total
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return { type: "tx", value: trimmed };
  }

  // Address: 0x + 40 hex chars = 42 total
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return { type: "address", value: trimmed };
  }

  // Block number (plain number)
  if (/^\d+$/.test(trimmed)) {
    return { type: "block", value: trimmed };
  }

  // Block hash (same as tx hash format, but user might input it)
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    if (trimmed.length === 66) return { type: "tx", value: trimmed };
    if (trimmed.length === 42) return { type: "address", value: trimmed };
  }

  return null;
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "tx":
      return "Transaction";
    case "address":
      return "Address";
    case "block":
      return "Block";
    default:
      return "";
  }
}

export default function TxSearch({ onSearch, loading }: TxSearchProps) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const detected = detectInputType(query);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detected) {
      setError(
        "Enter a valid transaction hash (0x...64 hex), address (0x...40 hex), or block number.",
      );
      return;
    }
    setError(null);
    onSearch(detected);
  };

  return (
    <div
      className="rounded-lg bs p-4"
      style={{
        backgroundColor: "var(--color-bg-card)",
      }}
    >
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError(null);
              }}
              placeholder="Search by tx hash, address, or block number..."
              className="w-full px-4 py-2.5 rounded-lg text-sm"
              style={{
                fontFamily: "var(--font-mono)",
                backgroundColor: "var(--color-bg-input)",
                borderColor: error
                  ? "var(--color-danger)"
                  : "var(--color-border-default)",
                color: "var(--color-text-primary)",
              }}
              disabled={loading}
            />
            {detected && query.trim() && (
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--color-accent-muted)",
                  color: "var(--color-accent)",
                }}
              >
                {getTypeLabel(detected.type)}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shrink-0"
            style={{
              backgroundColor:
                loading || !query.trim()
                  ? "var(--color-border-default)"
                  : "var(--color-accent)",
              color:
                loading || !query.trim()
                  ? "var(--color-text-muted)"
                  : "white",
              cursor:
                loading || !query.trim() ? "not-allowed" : "pointer",
              opacity: loading || !query.trim() ? 0.6 : 1,
            }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Loading
              </span>
            ) : (
              "Search"
            )}
          </button>
        </div>
        {error && (
          <p className="text-xs mt-2" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
