/**
 * Type-badge metadata for the alert dashboard. Each known alert.type has
 * a short label plus paired foreground/background colors driven by CSS
 * custom properties (so theme switches stay coherent). resolveTypeInfo
 * exposes a fallback for unknown types so a new server-side alert kind
 * still renders something readable — the badge just falls back to the
 * raw `type` string with neutral colors.
 */

export interface TypeInfo {
  label: string;
  color: string;
  bg: string;
}

const TYPE_LABELS: Record<string, TypeInfo> = {
  address_activity: {
    label: "Address",
    color: "var(--color-accent)",
    bg: "var(--color-accent-muted)",
  },
  contract_event: {
    label: "Event",
    color: "var(--color-success)",
    bg: "var(--color-success-muted)",
  },
  function_call: {
    label: "Function",
    color: "var(--color-warning)",
    bg: "var(--color-warning-muted)",
  },
  balance_threshold: {
    label: "Balance",
    color: "#58a6ff",
    bg: "rgba(88, 166, 255, 0.15)",
  },
  failed_tx: {
    label: "Failed TX",
    color: "var(--color-danger)",
    bg: "var(--color-danger-muted)",
  },
};

/**
 * Look up the badge metadata for an alert type. Returns a neutral
 * fallback (label = the raw type) when the type isn't known — useful
 * when the backend introduces a new alert kind before the frontend
 * ships the matching styling.
 */
export function resolveTypeInfo(type: string): TypeInfo {
  return (
    TYPE_LABELS[type] ?? {
      label: type,
      color: "var(--color-text-secondary)",
      bg: "var(--color-bg-tertiary)",
    }
  );
}

/** Exposed for tests — the canonical list of known alert types. */
export const KNOWN_ALERT_TYPES = Object.keys(TYPE_LABELS);
