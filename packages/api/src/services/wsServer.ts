import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WsClientState {
  /** Alert IDs this client has subscribed to.  Empty set = receive everything. */
  subscriptions: Set<number>;
  isAlive: boolean;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const clients = new Map<WebSocket, WsClientState>();

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseClientMessage(raw: string): { subscribe?: number; unsubscribe?: number } | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const msg = parsed as Record<string, unknown>;
    const result: { subscribe?: number; unsubscribe?: number } = {};

    if (typeof msg["subscribe"] === "number") result.subscribe = msg["subscribe"];
    if (typeof msg["unsubscribe"] === "number") result.unsubscribe = msg["unsubscribe"];

    return result;
  } catch {
    return null;
  }
}

function startHeartbeat(wss: WebSocketServer): void {
  heartbeatTimer = setInterval(() => {
    for (const [ws, state] of clients) {
      if (!state.isAlive) {
        // Stale — terminate and clean up
        clients.delete(ws);
        ws.terminate();
        continue;
      }
      state.isAlive = false;
      ws.ping();
    }
  }, 30_000);

  // Ensure the timer does not prevent Node from exiting
  heartbeatTimer.unref?.();

  wss.on("close", () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attach a WebSocket server to an existing HTTP server.
 * Clients connect at `ws://<host>/ws/alerts`.
 */
export function initWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws/alerts" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    const state: WsClientState = { subscriptions: new Set(), isAlive: true };
    clients.set(ws, state);

    ws.on("pong", () => {
      const clientState = clients.get(ws);
      if (clientState) clientState.isAlive = true;
    });

    ws.on("message", (data) => {
      const msg = parseClientMessage(String(data));
      if (!msg) return;

      const clientState = clients.get(ws);
      if (!clientState) return;

      if (msg.subscribe !== undefined) clientState.subscriptions.add(msg.subscribe);
      if (msg.unsubscribe !== undefined) clientState.subscriptions.delete(msg.unsubscribe);
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", (err) => {
      console.error("[ws] client error:", err);
      clients.delete(ws);
      ws.terminate();
    });
  });

  startHeartbeat(wss);

  console.log("[ws] WebSocket server listening on /ws/alerts");
  return wss;
}

/**
 * Broadcast a typed event to all connected clients.
 * Clients with active subscriptions only receive events matching their
 * subscribed alert IDs; clients with no subscriptions receive everything.
 */
export function broadcast(type: string, data: Record<string, unknown>): void {
  const payload = JSON.stringify({ type, data, ts: Date.now() });

  // Extract alertId from data when present so we can filter per-subscription
  const alertId =
    data["alert"] != null &&
    typeof data["alert"] === "object" &&
    "id" in data["alert"] &&
    typeof (data["alert"] as Record<string, unknown>)["id"] === "number"
      ? (data["alert"] as Record<string, unknown>)["id"] as number
      : undefined;

  for (const [ws, state] of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;

    const shouldReceive =
      state.subscriptions.size === 0 ||
      alertId === undefined ||
      state.subscriptions.has(alertId);

    if (shouldReceive) {
      ws.send(payload, (err) => {
        if (err) console.error("[ws] send error:", err);
      });
    }
  }
}
