export type SecretEntry = { key: string; value: string };

interface Props {
  secrets: SecretEntry[];
  setSecrets: (secrets: SecretEntry[]) => void;
}

export function SecretsEditor({ secrets, setSecrets }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label
          className="text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Secrets
        </label>
        <button
          onClick={() => setSecrets([...secrets, { key: "", value: "" }])}
          className="text-xs px-2 py-1 rounded bs transition-colors"
          style={{
            color: "var(--color-text-secondary)",
            backgroundColor: "transparent",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          + Add Secret
        </button>
      </div>
      {secrets.length === 0 && (
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          No secrets configured. Secrets are available as context.secrets in
          your code.
        </p>
      )}
      <div className="space-y-2">
        {secrets.map((s, i) => (
          <div key={i} className="flex gap-inline items-center">
            <input
              type="text"
              value={s.key}
              onChange={(e) => {
                const updated = [...secrets];
                updated[i] = { ...s, key: e.target.value };
                setSecrets(updated);
              }}
              placeholder="KEY"
              className="w-40 px-2 py-1.5 rounded bs text-xs font-mono"
              style={{
                backgroundColor: "var(--color-bg-input)",
                color: "var(--color-text-primary)",
              }}
            />
            <input
              type="password"
              value={s.value}
              onChange={(e) => {
                const updated = [...secrets];
                updated[i] = { ...s, value: e.target.value };
                setSecrets(updated);
              }}
              placeholder="value"
              className="flex-1 px-2 py-1.5 rounded bs text-xs font-mono"
              style={{
                backgroundColor: "var(--color-bg-input)",
                color: "var(--color-text-primary)",
              }}
            />
            <button
              onClick={() => setSecrets(secrets.filter((_, j) => j !== i))}
              className="text-xs px-2 py-1.5 rounded bs transition-colors"
              style={{
                color: "var(--color-danger)",
                backgroundColor: "transparent",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor =
                  "var(--color-danger-muted)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
