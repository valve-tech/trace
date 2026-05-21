export function LoadMoreButton({
  rowsPerPage,
  remaining,
  onClick,
  className,
}: {
  rowsPerPage: number;
  remaining: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderTop: "1px solid rgba(139, 148, 158, 0.2)",
        textAlign: "center",
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className={className}
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 500,
          border: "none",
          cursor: "pointer",
          backgroundColor: "rgba(99, 102, 241, 0.15)",
          color: "#6366f1",
        }}
      >
        Load {Math.min(rowsPerPage, remaining).toLocaleString()} more steps (
        {remaining.toLocaleString()} remaining)
      </button>
    </div>
  );
}
