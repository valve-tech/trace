/** Inline per-tab fallback for when a specific data source isn't available
 *  (e.g. opcode trace missing but call tree is fine). */
export function NoDataPanel({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg border p-8 text-center"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {message}
      </p>
    </div>
  );
}
