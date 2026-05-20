/**
 * Barrel re-export for the alert notification service. Implementation
 * lives under `services/notifier/`:
 *
 *   - types.ts      MatchData + NotificationChannel + TIMEOUT
 *   - channels.ts   per-channel senders (webhook / discord / slack / telegram)
 *   - dispatch.ts   fan-out with formatMessage + per-channel failure isolation
 */

export type { MatchData } from "./notifier/types.js";
export {
  sendWebhook,
  sendDiscord,
  sendSlack,
  sendTelegram,
} from "./notifier/channels.js";
export { dispatch } from "./notifier/dispatch.js";
