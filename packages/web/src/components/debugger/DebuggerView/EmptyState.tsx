import { Icon } from "@iconify/react";

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
      <Icon
        icon="heroicons:bug-ant"
        className="w-16 h-16 mb-4"
        style={{ color: "var(--color-border-default)" }}
      />
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
