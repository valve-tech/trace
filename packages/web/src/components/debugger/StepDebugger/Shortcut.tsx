/** Single keyboard-shortcut hint, rendered as `<kbd>keys</kbd> label`. */
export function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <span>
      <kbd
        className="px-1.5 py-0.5 rounded text-xs mr-1"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          boxShadow: "0 0 0 1px var(--color-border-default)",
          fontFamily: "var(--font-mono)",
          color: "var(--color-text-secondary)",
        }}
      >
        {keys}
      </kbd>
      {label}
    </span>
  );
}
