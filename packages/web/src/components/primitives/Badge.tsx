import type { ReactNode } from "react";

export type BadgeVariant = "ok" | "bad" | "warn" | "info" | "neutral";

const VARIANT: Record<BadgeVariant, { bg: string; fg: string }> = {
  ok: { bg: "var(--color-success-muted)", fg: "var(--color-success)" },
  bad: { bg: "var(--color-danger-muted)", fg: "var(--color-danger)" },
  warn: { bg: "var(--color-warning-muted)", fg: "var(--color-warning)" },
  info: { bg: "var(--color-accent-muted)", fg: "var(--color-accent)" },
  neutral: { bg: "var(--color-bg-tertiary)", fg: "var(--color-text-secondary)" },
};

/**
 * Semantic status pill. Generalizes the inline badges that were re-implemented
 * across alerts, tx-type tags, trigger labels, and detail headers. For the
 * specific Success/Reverted case keep using {@link StatusBadge}, which adds the
 * status dot; this is the open-ended variant.
 */
export function Badge({
  variant = "neutral",
  children,
  className = "",
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  const v = VARIANT[variant];
  return (
    <span
      className={`inline-flex items-center gap-tight text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 ${className}`}
      style={{ backgroundColor: v.bg, color: v.fg }}
    >
      {children}
    </span>
  );
}
