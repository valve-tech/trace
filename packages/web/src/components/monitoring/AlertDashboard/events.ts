import type { Alert } from "../../../api/alerts";
import type { AlertEvent } from "../../../hooks/useAlertWebSocket";
import { serializeServerTimestamp } from "./timestamps";

/**
 * Pure helpers for handling incoming WebSocket alert events in the
 * dashboard. The list update is split into two concerns: building a
 * minimal Alert from the WS payload (synthesizeAlertFromEvent), and
 * merging it into the current list while dropping duplicates
 * (mergeIncomingAlert).
 *
 * Both are pure (with `now` injected for time-determinism) so the
 * WebSocket effect in AlertDashboard becomes a one-liner that just
 * calls setAlerts(prev => mergeIncomingAlert(prev, event)).
 */

/**
 * Build a minimal Alert record from a WebSocket alert event. The WS
 * payload carries only the bare {id, name, type}; the dashboard card
 * needs the full Alert shape, so we fill in sensible defaults for the
 * fields not present in the WS message. The synthetic row gets
 * replaced once the next listAlerts() round-trip returns canonical
 * data, so the defaults only matter for the few-hundred-ms gap.
 */
export function synthesizeAlertFromEvent(
  event: AlertEvent,
  now: Date = new Date(),
): Alert {
  const stamp = serializeServerTimestamp(now);
  return {
    id: event.data.alert.id,
    name: event.data.alert.name,
    type: event.data.alert.type as Alert["type"],
    conditions: {},
    notifications: [],
    enabled: true,
    cooldown_seconds: 0,
    last_triggered_at: stamp,
    created_at: stamp,
    updated_at: stamp,
  };
}

/**
 * Merge an incoming WS alert event into the current list. If the
 * alert id is already present, returns the same array reference
 * unchanged (so React's bail-out skips a render); otherwise prepends a
 * synthetic Alert built from the event.
 *
 * Returning the same reference on duplicate is load-bearing — without
 * it, every duplicate event would trigger a re-render even though
 * nothing changed.
 */
export function mergeIncomingAlert(
  prev: readonly Alert[],
  event: AlertEvent,
  now: Date = new Date(),
): Alert[] {
  if (prev.some((a) => a.id === event.data.alert.id)) {
    return prev as Alert[];
  }
  return [synthesizeAlertFromEvent(event, now), ...prev];
}
