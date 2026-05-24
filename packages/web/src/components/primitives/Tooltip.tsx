import { useId, useState, type ReactNode } from "react";

type Side = "top" | "bottom";

/**
 * Themed hover/focus tooltip. Replaces the ad-hoc `role="tooltip"` CSS hack in
 * AppShell and gives every feature one accessible label-on-hover primitive.
 *
 * Visibility is driven by React state (not CSS `:hover`) so it also responds to
 * keyboard focus — the trigger should be a focusable element (button/link).
 */
export function Tooltip({
  label,
  side = "top",
  children,
  className = "",
}: {
  label: ReactNode;
  side?: Side;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const pos =
    side === "top"
      ? "bottom-[calc(100%+7px)]"
      : "top-[calc(100%+7px)]";

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute left-1/2 -translate-x-1/2 ${pos} z-30 whitespace-nowrap text-[11px] px-2.5 py-1.5 pointer-events-none`}
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            color: "var(--color-text-primary)",
            boxShadow:
              "0 0 0 1px var(--color-border-default), 0 6px 18px rgba(0,0,0,0.5)",
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
