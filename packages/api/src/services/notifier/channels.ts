import { NOTIFIER_TIMEOUT_MS } from "./types.js";

/**
 * Per-channel notification senders. Each function does its own
 * abort-on-timeout, logs non-OK responses, and swallows network errors —
 * one failed channel must not take down the others (the dispatcher uses
 * `Promise.allSettled`, but defensive isolation here is cheap).
 */

export async function sendWebhook(
  url: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFIER_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `[notifier] webhook returned ${res.status}: ${await res.text()}`,
      );
    }
  } catch (err) {
    console.error("[notifier] webhook error:", err);
  } finally {
    clearTimeout(timer);
  }
}

export async function sendDiscord(
  webhookUrl: string,
  message: string,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFIER_TIMEOUT_MS);
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
      console.warn(
        `[notifier] discord returned ${res.status}: ${await res.text()}`,
      );
    }
  } catch (err) {
    console.error("[notifier] discord error:", err);
  } finally {
    clearTimeout(timer);
  }
}

export async function sendSlack(
  webhookUrl: string,
  message: string,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFIER_TIMEOUT_MS);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "PulseChain Alert Triggered" },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: message },
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `[notifier] slack returned ${res.status}: ${await res.text()}`,
      );
    }
  } catch (err) {
    console.error("[notifier] slack error:", err);
  } finally {
    clearTimeout(timer);
  }
}

export async function sendTelegram(
  botToken: string,
  chatId: string,
  message: string,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFIER_TIMEOUT_MS);
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
      console.warn(
        `[notifier] telegram returned ${res.status}: ${await res.text()}`,
      );
    }
  } catch (err) {
    console.error("[notifier] telegram error:", err);
  } finally {
    clearTimeout(timer);
  }
}
