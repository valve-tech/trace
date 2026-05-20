import type { AlertRow } from "../db.js";
import type { MatchData, NotificationChannel } from "./types.js";
import {
  sendDiscord,
  sendSlack,
  sendTelegram,
  sendWebhook,
} from "./channels.js";

/**
 * Build a human-readable summary line for chat-style channels (Discord,
 * Slack, Telegram). Webhook channels get the structured payload instead.
 */
function formatMessage(alert: AlertRow, match: MatchData): string {
  const lines: string[] = [
    `Alert: ${alert.name}`,
    `Type: ${alert.type}`,
    `Summary: ${match.summary}`,
  ];

  if (match.txHash) lines.push(`TX: ${match.txHash}`);
  if (match.blockNumber) lines.push(`Block: ${match.blockNumber}`);
  if (match.from) lines.push(`From: ${match.from}`);
  if (match.to) lines.push(`To: ${match.to}`);
  if (match.value) lines.push(`Value: ${match.value}`);
  if (match.balance) lines.push(`Balance: ${match.balance}`);
  if (match.threshold) {
    lines.push(`Threshold: ${match.threshold} (${match.direction})`);
  }

  return lines.join("\n");
}

/**
 * Fan out a match to every configured channel concurrently. Failures
 * are isolated per-channel via try/catch + Promise.allSettled so one
 * down channel doesn't break the rest.
 *
 * Channel discriminator union: webhook → JSON payload, discord/slack →
 * markdown via webhookUrl, telegram → HTML via bot API.
 */
export async function dispatch(
  alert: AlertRow,
  matchData: MatchData,
): Promise<void> {
  const channels = alert.notifications as unknown as NotificationChannel[];
  if (!Array.isArray(channels) || channels.length === 0) return;

  const message = formatMessage(alert, matchData);
  const webhookPayload = {
    alert: { id: alert.id, name: alert.name, type: alert.type },
    match: matchData,
    timestamp: new Date().toISOString(),
  };

  const promises = channels.map(async (channel) => {
    try {
      switch (channel.type) {
        case "webhook":
          if (channel.url) await sendWebhook(channel.url, webhookPayload);
          break;
        case "discord":
          if (channel.webhookUrl || channel.url) {
            await sendDiscord((channel.webhookUrl || channel.url)!, message);
          }
          break;
        case "slack":
          if (channel.webhookUrl || channel.url) {
            await sendSlack((channel.webhookUrl || channel.url)!, message);
          }
          break;
        case "telegram":
          if (channel.botToken && channel.chatId) {
            await sendTelegram(channel.botToken, channel.chatId, message);
          }
          break;
        default:
          console.warn(`[notifier] unknown channel type: ${channel.type}`);
      }
    } catch (err) {
      console.error(
        `[notifier] failed to send ${channel.type} for alert ${alert.id}:`,
        err,
      );
    }
  });

  await Promise.allSettled(promises);
}
