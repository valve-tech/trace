import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@iconify/react";

export interface DropdownOption<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * Menu-based replacement for native <select>, which renders inconsistently
 * across browsers/OSes and can't be themed. A button opens a popover listbox
 * styled with the app's box-shadow borders; closes on select, outside-click,
 * or Escape. Keyboard: Enter/Space toggles, arrows move, Escape closes.
 */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  align = "left",
  className = "",
  buttonClassName = "",
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  align?: "left" | "right";
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-inline px-2.5 py-1.5 text-xs transition-colors theme-input-bg theme-text-secondary bs-in-muted ${buttonClassName}`}
      >
        <span className="truncate">{current?.label ?? value}</span>
        <Icon
          icon="heroicons:chevron-down"
          className="w-3 h-3 shrink-0 theme-text-muted"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`card absolute z-30 mt-1 min-w-full theme-card-bg ${align === "right" ? "right-0" : "left-0"}`}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-inline px-3 py-1.5 text-xs text-left whitespace-nowrap transition-colors bg-transparent ${selected ? "theme-accent" : "theme-text"}`}
              >
                <Icon
                  icon="heroicons:check"
                  className="w-3 h-3 shrink-0"
                  style={{ opacity: selected ? 1 : 0 }}
                />
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
