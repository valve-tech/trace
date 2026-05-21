type Size = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, { padding: string; text: string; dot: string }> = {
  sm: { padding: "px-2 py-0.5", text: "text-xs", dot: "w-1.5 h-1.5" },
  md: { padding: "px-2.5 py-1", text: "text-xs", dot: "w-1.5 h-1.5" },
  lg: { padding: "px-3 py-1", text: "text-sm", dot: "w-2 h-2" },
};

/** Success / Reverted status pill. Used in simulation results, bundle rows,
 *  and tx detail headers. `success: false` renders the "Reverted" variant. */
export function StatusBadge({ success, size = "md" }: { success: boolean; size?: Size }) {
  const s = SIZE_CLASSES[size];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${s.padding} ${s.text}`}
      style={{
        backgroundColor: success
          ? "var(--color-success-muted)"
          : "var(--color-danger-muted)",
        color: success ? "var(--color-success)" : "var(--color-danger)",
      }}
    >
      <span
        className={`rounded-full ${s.dot}`}
        style={{
          backgroundColor: success ? "var(--color-success)" : "var(--color-danger)",
        }}
      />
      {success ? "Success" : "Reverted"}
    </span>
  );
}
