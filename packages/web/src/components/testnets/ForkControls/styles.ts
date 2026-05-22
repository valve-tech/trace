export const sectionStyle = {
  backgroundColor: "var(--color-bg-tertiary)",
  boxShadow: "0 0 0 1px var(--color-border-muted)",
};

export const inputStyle = {
  backgroundColor: "var(--color-bg-input)",
  boxShadow: "0 0 0 1px var(--color-border-default)",
  color: "var(--color-text-primary)",
};

export function msgColor(msg: string | null): string {
  if (!msg) return "transparent";
  return msg.startsWith("Error")
    ? "var(--color-danger)"
    : "var(--color-success)";
}
