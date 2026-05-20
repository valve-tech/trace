export const sectionStyle = {
  backgroundColor: "var(--color-bg-tertiary)",
  borderColor: "var(--color-border-muted)",
};

export const inputStyle = {
  backgroundColor: "var(--color-bg-input)",
  borderColor: "var(--color-border-default)",
  color: "var(--color-text-primary)",
};

export function msgColor(msg: string | null): string {
  if (!msg) return "transparent";
  return msg.startsWith("Error")
    ? "var(--color-danger)"
    : "var(--color-success)";
}
