import type { ReactNode } from "react";
import { Icon } from "@iconify/react";

/**
 * Consistent zero/empty state. Replaces the one-off "No pending transactions",
 * "No trace available", and search-no-results blocks scattered across features.
 */
export function EmptyState({
  icon = "heroicons:inbox",
  title,
  subtitle,
  action,
  className = "",
}: {
  icon?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center text-center px-6 py-10 ${className}`}>
      <Icon
        icon={icon}
        className="w-7 h-7"
        style={{ color: "var(--color-text-muted)" }}
      />
      <div
        className="text-sm mt-3"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          className="text-xs mt-1 max-w-[340px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          {subtitle}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
