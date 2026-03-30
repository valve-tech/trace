import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertToastAlert {
  name: string;
  type: string;
}

interface AlertToastMatch {
  summary?: string;
}

interface AlertToastProps {
  alert: AlertToastAlert;
  match: AlertToastMatch;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Small fixed toast notification that slides in from the right and
 * auto-dismisses after 5 seconds.
 */
export default function AlertToast({ alert, match }: AlertToastProps) {
  const [visible, setVisible] = useState(false);

  // Trigger slide-in on mount, auto-dismiss after 5 s
  useEffect(() => {
    // Slight delay so the CSS transition fires after the element is in the DOM
    const showTimer = setTimeout(() => setVisible(true), 20);
    const hideTimer = setTimeout(() => setVisible(false), 5_000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    bottom: "1.5rem",
    right: "1.5rem",
    zIndex: 9999,
    minWidth: "16rem",
    maxWidth: "22rem",
    backgroundColor: "var(--color-bg-card)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "0.5rem",
    padding: "0.75rem 1rem",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    transform: visible ? "translateX(0)" : "translateX(calc(100% + 1.5rem))",
    opacity: visible ? 1 : 0,
    transition: "transform 0.3s ease, opacity 0.3s ease",
    pointerEvents: visible ? "auto" : "none",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.25rem",
  };

  const dotStyle: React.CSSProperties = {
    width: "0.5rem",
    height: "0.5rem",
    borderRadius: "50%",
    backgroundColor: "var(--color-warning)",
    flexShrink: 0,
  };

  const nameStyle: React.CSSProperties = {
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "var(--color-text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const typeStyle: React.CSSProperties = {
    fontSize: "0.6875rem",
    padding: "0.1rem 0.375rem",
    borderRadius: "9999px",
    backgroundColor: "var(--color-accent-muted)",
    color: "var(--color-accent)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    flexShrink: 0,
  };

  const summaryStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    color: "var(--color-text-secondary)",
    marginTop: "0.125rem",
  };

  return (
    <div style={containerStyle} role="alert" aria-live="polite">
      <div style={headerStyle}>
        <div style={dotStyle} />
        <span style={nameStyle}>{alert.name}</span>
        <span style={typeStyle}>{alert.type.replace(/_/g, " ")}</span>
      </div>
      {match.summary && (
        <p style={summaryStyle}>{match.summary}</p>
      )}
    </div>
  );
}
