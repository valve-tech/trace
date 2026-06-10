type Size = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, { padding: string; text: string; dot: string }> = {
  sm: { padding: "px-2 py-0.5", text: "text-xs", dot: "w-1.5 h-1.5" },
  md: { padding: "px-2.5 py-1", text: "text-xs", dot: "w-1.5 h-1.5" },
  lg: { padding: "px-3 py-1", text: "text-sm", dot: "w-2 h-2" },
};

/** Success / Reverted / Pending status pill. Used in simulation results, bundle
 *  rows, and tx detail headers. `success: false` renders the "Reverted" variant;
 *  `pending` (the mempool case — no receipt yet) overrides `success` and renders
 *  a neutral amber "Pending" pill, since the outcome isn't known. */
export function StatusBadge({
  success,
  pending = false,
  size = "md",
}: {
  success: boolean;
  pending?: boolean;
  size?: Size;
}) {
  const s = SIZE_CLASSES[size];
  const color = pending
    ? "var(--color-warning)"
    : success
      ? "var(--color-success)"
      : "var(--color-danger)";
  const bg = pending
    ? "var(--color-warning-muted)"
    : success
      ? "var(--color-success-muted)"
      : "var(--color-danger-muted)";
  const label = pending ? "Pending" : success ? "Success" : "Reverted";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${s.padding} ${s.text}`}
      style={{ backgroundColor: bg, color }}
    >
      <span className={`rounded-full ${s.dot}`} style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
