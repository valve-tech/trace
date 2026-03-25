import type { AlertRow } from "./db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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

interface NotificationChannel {
  type: "webhook" | "discord" | "slack" | "telegram";
  url?: string;
  webhookUrl?: string;
  botToken?: string;
  chatId?: string;
}

const TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------
export async function sendWebhook(
  url: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[notifier] webhook returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error("[notifier] webhook error:", err);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Discord
// ---------------------------------------------------------------------------
export async function sendDiscord(
  webhookUrl: string,
  message: string,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "PulseChain Alert Triggered",
            description: message,
            color: 0x8b5cf6,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[notifier] discord returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error("[notifier] discord error:", err);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------
export async function sendSlack(
  webhookUrl: string,
  message: string,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "PulseChain Alert Triggered",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: message,
            },
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[notifier] slack returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error("[notifier] slack error:", err);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------
export async function sendTelegram(
  botToken: string,
  chatId: string,
  message: string,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[notifier] telegram returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error("[notifier] telegram error:", err);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Dispatch – route to appropriate channels
// ---------------------------------------------------------------------------
export async function dispatch(
  alert: AlertRow,
  matchData: MatchData,
): Promise<void> {
  let channels: NotificationChannel[];
  try {
    channels = JSON.parse(alert.notifications) as NotificationChannel[];
  } catch {
    console.error(`[notifier] invalid notifications JSON for alert ${alert.id}`);
    return;
  }

  if (!Array.isArray(channels) || channels.length === 0) return;

  const message = formatMessage(alert, matchData);
  const webhookPayload = {
    alert: {
      id: alert.id,
      name: alert.name,
      type: alert.type,
    },
    match: matchData,
    timestamp: new Date().toISOString(),
  };

  const promises = channels.map(async (channel) => {
    try {
      switch (channel.type) {
        case "webhook":
          if (channel.url) {
            await sendWebhook(channel.url, webhookPayload);
          }
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
      console.error(`[notifier] failed to send ${channel.type} for alert ${alert.id}:`, err);
    }
  });

  await Promise.allSettled(promises);
}

// ---------------------------------------------------------------------------
// Format a human-readable message
// ---------------------------------------------------------------------------
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
  if (match.threshold) lines.push(`Threshold: ${match.threshold} (${match.direction})`);

  return lines.join("\n");
}
