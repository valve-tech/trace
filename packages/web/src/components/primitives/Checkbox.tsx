import type { ReactNode } from "react";
import { Icon } from "@iconify/react";

/**
 * Themed checkbox. Native <input type="checkbox"> can't be styled consistently
 * across browsers (the box chrome is OS-drawn), so this is a button-based
 * control: a box that fills with the accent + a check when on. Keyboard- and
 * screen-reader-friendly via role="checkbox" + aria-checked on a real button.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-inline transition-opacity ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${className}`}
      style={{ backgroundColor: "transparent" }}
    >
      <span
        className="flex items-center justify-center w-4 h-4 shrink-0 transition-colors"
        style={{
          backgroundColor: checked ? "var(--color-accent)" : "transparent",
          boxShadow: `inset 0 0 0 1px ${
            checked ? "var(--color-accent)" : "var(--color-border-default)"
          }`,
          color: "#fff",
        }}
      >
        {checked && <Icon icon="heroicons:check" className="w-3 h-3" />}
      </span>
      {label != null && (
        <span className="text-sm theme-text-secondary">
          {label}
        </span>
      )}
    </button>
  );
}
