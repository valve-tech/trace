/** Pre-search placeholder. Shown when no tx hash has been submitted yet. */
export function EmptyState() {
  return (
    <div
      className="rounded-lg border p-12 flex flex-col items-center justify-center text-center"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <svg
        className="w-16 h-16 mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1}
        style={{ color: "var(--color-border-default)" }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152-6.135c-.117-1.687-.933-3.198-2.121-4.172A8.054 8.054 0 0012 2.25a8.054 8.054 0 00-4.934 1.683c-1.188.974-2.004 2.485-2.121 4.172a23.91 23.91 0 01-1.152 6.135A24.089 24.089 0 0112 12.75z"
        />
      </svg>
      <p
        className="text-sm mb-1"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Enter a transaction hash to debug
      </p>
      <p
        className="text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
        Inspect call trees, gas usage, and opcode execution
      </p>
    </div>
  );
}
