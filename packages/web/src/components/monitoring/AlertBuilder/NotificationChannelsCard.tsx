import type { NotificationChannel } from "../../../api/alerts";
import { CHANNEL_TYPES } from "./constants";
import { cardStyle, inputStyle, labelStyle } from "./styles";

interface Props {
  notifications: NotificationChannel[];
  setNotifications: (next: NotificationChannel[]) => void;
}

export function NotificationChannelsCard({
  notifications,
  setNotifications,
}: Props) {
  const addChannel = () =>
    setNotifications([...notifications, { type: "webhook", url: "" }]);

  const removeChannel = (index: number) =>
    setNotifications(notifications.filter((_, i) => i !== index));

  const updateChannel = (
    index: number,
    updates: Partial<NotificationChannel>,
  ) =>
    setNotifications(
      notifications.map((ch, i) => (i === index ? { ...ch, ...updates } : ch)),
    );

  return (
    <div className="rounded-lg border p-4 space-y-4" style={cardStyle}>
      <div
        className="flex items-center justify-between pb-3 border-b"
        style={{ borderColor: "var(--color-border-muted)" }}
      >
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Notification Channels
        </h3>
        <button
          type="button"
          onClick={addChannel}
          className="text-xs px-2.5 py-1 rounded-md font-medium"
          style={{
            backgroundColor: "var(--color-accent-muted)",
            color: "var(--color-accent)",
          }}
        >
          + Add Channel
        </button>
      </div>

      {notifications.length === 0 && (
        <p
          className="text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          No notification channels configured. Alerts will still be recorded
          in history.
        </p>
      )}

      {notifications.map((channel, index) => (
        <ChannelEditor
          key={index}
          channel={channel}
          onUpdate={(updates) => updateChannel(index, updates)}
          onRemove={() => removeChannel(index)}
        />
      ))}
    </div>
  );
}

function ChannelEditor({
  channel,
  onUpdate,
  onRemove,
}: {
  channel: NotificationChannel;
  onUpdate: (updates: Partial<NotificationChannel>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="rounded-md border p-3 space-y-3"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-border-muted)",
      }}
    >
      <div className="flex items-center justify-between">
        <select
          value={channel.type}
          onChange={(e) =>
            onUpdate({
              type: e.target.value as NotificationChannel["type"],
              url: "",
              webhookUrl: "",
              botToken: "",
              chatId: "",
            })
          }
          className="px-2 py-1 rounded-md border text-xs"
          style={inputStyle}
        >
          {CHANNEL_TYPES.map((ct) => (
            <option key={ct.value} value={ct.value}>
              {ct.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs px-2 py-1 rounded-md"
          style={{
            color: "var(--color-danger)",
            backgroundColor: "var(--color-danger-muted)",
          }}
        >
          Remove
        </button>
      </div>

      {(channel.type === "webhook" ||
        channel.type === "discord" ||
        channel.type === "slack") && (
        <WebhookField channel={channel} onUpdate={onUpdate} />
      )}

      {channel.type === "telegram" && (
        <TelegramFields channel={channel} onUpdate={onUpdate} />
      )}
    </div>
  );
}

function WebhookField({
  channel,
  onUpdate,
}: {
  channel: NotificationChannel;
  onUpdate: (updates: Partial<NotificationChannel>) => void;
}) {
  const label =
    channel.type === "webhook"
      ? "Webhook URL"
      : `${channel.type.charAt(0).toUpperCase() + channel.type.slice(1)} Webhook URL`;

  return (
    <div>
      <label
        className="text-xs font-medium mb-1 block"
        style={labelStyle}
      >
        {label}
      </label>
      <input
        type="text"
        value={channel.url ?? channel.webhookUrl ?? ""}
        onChange={(e) =>
          onUpdate({
            url: e.target.value,
            webhookUrl: e.target.value,
          })
        }
        placeholder="https://..."
        className="w-full px-3 py-2 rounded-md border text-xs"
        style={inputStyle}
      />
    </div>
  );
}

function TelegramFields({
  channel,
  onUpdate,
}: {
  channel: NotificationChannel;
  onUpdate: (updates: Partial<NotificationChannel>) => void;
}) {
  return (
    <>
      <div>
        <label
          className="text-xs font-medium mb-1 block"
          style={labelStyle}
        >
          Bot Token
        </label>
        <input
          type="text"
          value={channel.botToken ?? ""}
          onChange={(e) => onUpdate({ botToken: e.target.value })}
          placeholder="123456789:ABCdefGHIjklMNOpqrstUVWxyz"
          className="w-full px-3 py-2 rounded-md border text-xs"
          style={inputStyle}
        />
      </div>
      <div>
        <label
          className="text-xs font-medium mb-1 block"
          style={labelStyle}
        >
          Chat ID
        </label>
        <input
          type="text"
          value={channel.chatId ?? ""}
          onChange={(e) => onUpdate({ chatId: e.target.value })}
          placeholder="-1001234567890"
          className="w-full px-3 py-2 rounded-md border text-xs"
          style={inputStyle}
        />
      </div>
    </>
  );
}
