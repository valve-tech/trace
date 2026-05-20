/**
 * Wire shape passed from the matchers up through the notifier. `summary`
 * is the always-present human-readable line; every other field is
 * conditional on the alert type that produced the match.
 */
export interface MatchData {
  type: string;
  txHash?: string;
  blockNumber?: number;
  from?: string;
  to?: string;
  value?: string;
  eventSignature?: string;
  functionSelector?: string;
  balance?: string;
  threshold?: string;
  direction?: string;
  summary: string;
}

export interface NotificationChannel {
  type: "webhook" | "discord" | "slack" | "telegram";
  url?: string;
  webhookUrl?: string;
  botToken?: string;
  chatId?: string;
}

/** Hard upper bound on any single notification send. */
export const NOTIFIER_TIMEOUT_MS = 10_000;
