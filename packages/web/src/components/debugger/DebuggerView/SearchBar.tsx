/** Header card with tx-hash input + Debug button + inline validation hint. */
export function SearchBar({
  txHash,
  setTxHash,
  isValidHash,
  loading,
  onSubmit,
}: {
  txHash: string;
  setTxHash: (h: string) => void;
  isValidHash: boolean;
  loading: boolean;
  onSubmit: () => void;
}) {
  return (
    <div
      className="rounded-lg border p-6"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <h2
        className="text-lg font-semibold mb-1"
        style={{ color: "var(--color-text-primary)" }}
      >
        Smart Contract Debugger
      </h2>
      <p
        className="text-sm mb-4"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Paste a transaction hash to inspect its execution trace, call tree, and gas usage.
      </p>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="0x... transaction hash"
          value={txHash}
          onChange={(e) => setTxHash(e.target.value.trim())}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
          className="flex-1 px-4 py-2.5 rounded-lg border text-sm"
          style={{
            backgroundColor: "var(--color-bg-input)",
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
          }}
        />
        <button
          onClick={onSubmit}
          disabled={!isValidHash || loading}
          className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor:
              isValidHash && !loading
                ? "var(--color-accent)"
                : "var(--color-border-default)",
            color:
              isValidHash && !loading
                ? "#ffffff"
                : "var(--color-text-muted)",
            cursor: isValidHash && !loading ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "Tracing..." : "Debug"}
        </button>
      </div>

      {txHash && !isValidHash && txHash.length > 2 && (
        <p className="text-xs mt-2" style={{ color: "var(--color-danger)" }}>
          Invalid transaction hash. Must be a 0x-prefixed 64-character hex string.
        </p>
      )}
    </div>
  );
}
