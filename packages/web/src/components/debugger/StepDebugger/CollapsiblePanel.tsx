import { useState } from "react";

/** Disclosure panel: click the header to toggle body visibility.
 *  Used for Stack, Memory, and the Execution Trace section. */
export function CollapsiblePanel({
  title,
  count,
  suffix,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  suffix?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="card overflow-hidden"
      style={{ backgroundColor: "var(--color-bg-card)", boxShadow: "0 0 0 1px var(--color-border-default)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 card-divider cursor-pointer"
        style={{ backgroundColor: "var(--color-bg-secondary)" }}
      >
        <span className="flex items-center gap-inline">
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {open ? "▼" : "▶"}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-secondary)" }}>
            {title}
          </span>
        </span>
        {count !== undefined && (
          <span className="text-xs" style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
            {count.toLocaleString()} {suffix ?? "items"}
          </span>
        )}
      </button>
      {open && children}
    </div>
  );
}
