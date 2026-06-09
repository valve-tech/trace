import { useState, useEffect, useRef, useCallback } from "react";
import { wsUrl } from "../lib/apiBase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlertEventAlert {
  id: number;
  name: string;
  type: string;
}

export interface AlertEventMatch {
  summary?: string;
  [key: string]: unknown;
}

export interface AlertEvent {
  type: "alert_triggered";
  data: {
    alert: AlertEventAlert;
    match: AlertEventMatch;
  };
  ts: number;
}

export interface UseAlertWebSocketResult {
  lastAlert: AlertEvent | null;
  connected: boolean;
  alerts: AlertEvent[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ALERTS = 50;
const RECONNECT_DELAY_MS = 5_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Connects to the WebSocket alert stream on port 10100 and returns the live
 * alert feed. Auto-reconnects on disconnect with a 5-second delay.
 */
export function useAlertWebSocket(): UseAlertWebSocketResult {
  const [connected, setConnected] = useState(false);
  const [lastAlert, setLastAlert] = useState<AlertEvent | null>(null);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const ws = new WebSocket(wsUrl("/ws/alerts"));
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      if (unmountedRef.current) return;
      setConnected(true);
    });

    ws.addEventListener("close", () => {
      if (unmountedRef.current) return;
      setConnected(false);
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    });

    ws.addEventListener("error", () => {
      // close event fires after error, so reconnect is handled there
      if (unmountedRef.current) return;
      setConnected(false);
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      if (unmountedRef.current) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        (parsed as Record<string, unknown>)["type"] !== "alert_triggered"
      ) {
        return;
      }

      const alertEvent = parsed as AlertEvent;
      setLastAlert(alertEvent);
      setAlerts((prev) => [alertEvent, ...prev].slice(0, MAX_ALERTS));
    });
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;

      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (wsRef.current !== null) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { lastAlert, connected, alerts };
}
