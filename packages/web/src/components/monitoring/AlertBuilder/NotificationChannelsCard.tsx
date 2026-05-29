import type { NotificationChannel } from "../../../api/alerts";
import { Dropdown } from "../../primitives/Dropdown";
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
    <div className="rounded-lg p-4 space-y-stack" style={cardStyle}>
      <div
        className="flex items-center justify-between pb-3 bs-b-muted"
        style={{}}
      >
        <h3
          className="text-sm font-semibold theme-text"
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
          className="text-sm theme-text-muted"
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
      className="rounded-md bs-muted p-3 space-y-3 theme-primary-bg"
    >
      <div className="flex items-center justify-between">
        <Dropdown<NotificationChannel["type"]>
          value={channel.type}
          onChange={(v) =>
            onUpdate({
              type: v,
              url: "",
              webhookUrl: "",
              botToken: "",
              chatId: "",
            })
          }
          ariaLabel="Channel type"
          options={CHANNEL_TYPES.map((ct) => ({ value: ct.value, label: ct.label }))}
        />
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
        className="w-full px-3 py-2 rounded-md text-xs"
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
          className="w-full px-3 py-2 rounded-md text-xs"
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
          className="w-full px-3 py-2 rounded-md text-xs"
          style={inputStyle}
        />
      </div>
    </>
  );
}
