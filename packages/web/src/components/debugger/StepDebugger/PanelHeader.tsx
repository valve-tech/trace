/** Section header for storage / stack / memory panels. Shows a title and an
 *  optional count + units label on the right. */
export function PanelHeader({
  title,
  count,
  suffix,
}: {
  title: string;
  count?: number;
  suffix?: string;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2 card-divider theme-secondary-bg"
    >
      <span
        className="text-xs font-semibold uppercase tracking-wider theme-text-secondary"
      >
        {title}
      </span>
      {count !== undefined && (
        <span
          className="text-xs"
          style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}
        >
          {count.toLocaleString()} {suffix ?? "items"}
        </span>
      )}
    </div>
  );
}
