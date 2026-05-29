/** Page header: title + description + tx-hash input. Rendered flat inside the
 *  AppShell's outer padding — no card chrome, so we don't pay padding twice
 *  (AppShell already gives the page its margin). */
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
    <div>
      <h2
        className="text-lg font-semibold mb-1 theme-text"
      >
        Smart Contract Debugger
      </h2>
      <p
        className="text-sm mb-4 theme-text-secondary"
      >
        Paste a transaction hash to inspect its execution trace, call tree, and gas usage.
      </p>

      <div className="flex gap-row">
        <input
          type="text"
          placeholder="0x... transaction hash"
          value={txHash}
          onChange={(e) => setTxHash(e.target.value.trim())}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
          className="flex-1 px-4 py-2.5 rounded-lg bs text-sm"
          style={{
            backgroundColor: "var(--color-bg-input)",
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
        <p className="text-xs mt-2 theme-danger">
          Invalid transaction hash. Must be a 0x-prefixed 64-character hex string.
        </p>
      )}
    </div>
  );
}
