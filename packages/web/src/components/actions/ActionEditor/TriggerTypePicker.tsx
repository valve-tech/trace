const TRIGGER_TYPES = ["block", "event", "periodic", "webhook"] as const;

interface Props {
  triggerType: string;
  onChange: (t: string) => void;
}

export function TriggerTypePicker({ triggerType, onChange }: Props) {
  return (
    <div>
      <label
        className="block text-sm font-medium mb-1.5"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Trigger Type
      </label>
      <div className="flex gap-2">
        {TRIGGER_TYPES.map((t) => {
          const active = triggerType === t;
          return (
            <button
              key={t}
              onClick={() => onChange(t)}
              className="px-3 py-1.5 text-sm rounded-md border transition-colors capitalize"
              style={{
                borderColor: active
                  ? "var(--color-accent)"
                  : "var(--color-border-default)",
                color: active
                  ? "var(--color-accent)"
                  : "var(--color-text-secondary)",
                backgroundColor: active
                  ? "var(--color-accent-muted)"
                  : "transparent",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}
