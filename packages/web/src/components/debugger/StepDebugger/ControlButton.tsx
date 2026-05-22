/** Mono-styled button used in the step-debugger toolbar.
 *  `small` shrinks padding+font; `accent` swaps to the brand-accent palette. */
export function ControlButton({
  label,
  title,
  onClick,
  small,
  accent,
}: {
  label: string;
  title: string;
  onClick: () => void;
  small?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded font-mono font-semibold transition-colors"
      style={{
        padding: small ? "2px 6px" : "2px 10px",
        fontSize: small ? "10px" : "12px",
        backgroundColor: accent
          ? "var(--color-accent-muted)"
          : "var(--color-bg-secondary)",
        color: accent
          ? "var(--color-accent)"
          : "var(--color-text-primary)",
        boxShadow: "0 0 0 1px var(--color-border-default)",
      }}
    >
      {label}
    </button>
  );
}
