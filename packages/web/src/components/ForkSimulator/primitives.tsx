export function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
      style={{
        backgroundColor: active
          ? "var(--color-accent)"
          : "var(--color-bg-secondary)",
        color: active ? "#fff" : "var(--color-text-secondary)",
        boxShadow: `0 0 0 1px ${
          active ? "var(--color-accent)" : "var(--color-border-default)"
        }`,
      }}
    >
      {label}
    </button>
  );
}

export function FormField({
  label,
  value,
  onChange,
  placeholder,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  const style = {
    backgroundColor: "var(--color-bg-input)",
    boxShadow: "0 0 0 1px var(--color-border-default)",
    color: "var(--color-text-primary)",
    fontFamily: mono ? "var(--font-mono)" : undefined,
  };

  return (
    <div>
      <label
        className="text-xs font-medium block mb-1 theme-text-secondary"
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full px-3 py-2 rounded-lg text-sm resize-none"
          style={style}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={style}
        />
      )}
    </div>
  );
}

export function DiffSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg bs overflow-hidden"
      style={{
        backgroundColor: "var(--color-bg-card)",
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 bs-b"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
        }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider theme-text-secondary"
        >
          {title}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "var(--color-accent-muted)",
            color: "var(--color-accent)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}
