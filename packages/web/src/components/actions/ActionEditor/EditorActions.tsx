interface Props {
  isEdit: boolean;
  saving: boolean;
  testing: boolean;
  onSave: () => void;
  onTest: () => void;
}

export function EditorActions({
  isEdit,
  saving,
  testing,
  onSave,
  onTest,
}: Props) {
  return (
    <div className="flex gap-3">
      <button
        onClick={onSave}
        disabled={saving}
        className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
        style={{
          backgroundColor: saving
            ? "var(--color-accent-muted)"
            : "var(--color-accent)",
          color: "white",
        }}
        onMouseOver={(e) => {
          if (!saving)
            e.currentTarget.style.backgroundColor =
              "var(--color-accent-hover)";
        }}
        onMouseOut={(e) => {
          if (!saving)
            e.currentTarget.style.backgroundColor = "var(--color-accent)";
        }}
      >
        {saving ? "Saving..." : isEdit ? "Update Action" : "Create Action"}
      </button>
      {isEdit && (
        <button
          onClick={onTest}
          disabled={testing}
          className="px-4 py-2 rounded-md text-sm font-medium bs transition-colors"
          style={{
            color: testing
              ? "var(--color-text-muted)"
              : "var(--color-text-secondary)",
            backgroundColor: "transparent",
          }}
          onMouseOver={(e) => {
            if (!testing)
              e.currentTarget.style.backgroundColor =
                "var(--color-bg-tertiary)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          {testing ? "Running..." : "Test Run"}
        </button>
      )}
    </div>
  );
}
