import { useState } from "react";
import {
  createAlert,
  updateAlert,
  type Alert,
  type AlertType,
  type AlertConditions,
  type NotificationChannel,
  type CreateAlertPayload,
} from "../../api/alerts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AlertBuilderProps {
  alert?: Alert | null;
  onSaved: () => void;
  onCancel: () => void;
}

const ALERT_TYPES: { value: AlertType; label: string }[] = [
  { value: "address_activity", label: "Address Activity" },
  { value: "contract_event", label: "Contract Event" },
  { value: "function_call", label: "Function Call" },
  { value: "balance_threshold", label: "Balance Threshold" },
  { value: "failed_tx", label: "Failed Transaction" },
];

const CHANNEL_TYPES: { value: NotificationChannel["type"]; label: string }[] = [
  { value: "webhook", label: "Webhook" },
  { value: "discord", label: "Discord" },
  { value: "slack", label: "Slack" },
  { value: "telegram", label: "Telegram" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AlertBuilder({
  alert,
  onSaved,
  onCancel,
}: AlertBuilderProps) {
  const [name, setName] = useState(alert?.name ?? "");
  const [type, setType] = useState<AlertType>(alert?.type ?? "address_activity");
  const [conditions, setConditions] = useState<AlertConditions>(
    alert?.conditions ?? {},
  );
  const [notifications, setNotifications] = useState<NotificationChannel[]>(
    alert?.notifications ?? [],
  );
  const [cooldown, setCooldown] = useState(
    String(alert?.cooldown_seconds ?? 60),
  );
  const [enabled, setEnabled] = useState(alert?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!alert;

  // Reset conditions when type changes (only if not editing)
  const handleTypeChange = (newType: AlertType) => {
    setType(newType);
    if (!isEdit) {
      setConditions({});
    }
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);

    try {
      const payload: CreateAlertPayload = {
        name,
        type,
        conditions,
        notifications,
        enabled,
        cooldown_seconds: parseInt(cooldown, 10) || 60,
      };

      if (isEdit && alert) {
        await updateAlert(alert.id, payload);
      } else {
        await createAlert(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save alert");
    } finally {
      setSaving(false);
    }
  };

  const addChannel = () => {
    setNotifications([...notifications, { type: "webhook", url: "" }]);
  };

  const removeChannel = (index: number) => {
    setNotifications(notifications.filter((_, i) => i !== index));
  };

  const updateChannel = (
    index: number,
    updates: Partial<NotificationChannel>,
  ) => {
    setNotifications(
      notifications.map((ch, i) => (i === index ? { ...ch, ...updates } : ch)),
    );
  };

  const inputStyle = {
    fontFamily: "var(--font-mono)",
    backgroundColor: "var(--color-bg-input)",
    borderColor: "var(--color-border-default)",
    color: "var(--color-text-primary)",
  };

  const labelStyle = { color: "var(--color-text-secondary)" };

  const cardStyle = {
    backgroundColor: "var(--color-bg-card)",
    borderColor: "var(--color-border-default)",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {isEdit ? "Edit Alert" : "Create Alert"}
        </h2>
        <button
          onClick={onCancel}
          className="text-sm px-3 py-1.5 rounded-md border"
          style={{
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-secondary)",
            backgroundColor: "transparent",
          }}
        >
          Cancel
        </button>
      </div>

      {error && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            backgroundColor: "var(--color-danger-muted)",
            borderColor: "var(--color-danger)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* Alert Name */}
      <div className="rounded-lg border p-4 space-y-4" style={cardStyle}>
        <h3
          className="text-sm font-semibold pb-3 border-b"
          style={{
            color: "var(--color-text-primary)",
            borderColor: "var(--color-border-muted)",
          }}
        >
          Basic Info
        </h3>

        <div>
          <label className="text-xs font-medium mb-1.5 block" style={labelStyle}>
            Alert Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Large Transfer Monitor"
            className="w-full px-3 py-2 rounded-md border text-sm"
            style={inputStyle}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={labelStyle}>
              Alert Type
            </label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as AlertType)}
              className="w-full px-3 py-2 rounded-md border text-sm"
              style={inputStyle}
            >
              {ALERT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={labelStyle}>
              Cooldown (seconds)
            </label>
            <input
              type="number"
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
              placeholder="60"
              min={0}
              className="w-full px-3 py-2 rounded-md border text-sm"
              style={inputStyle}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className="relative w-10 h-5 rounded-full transition-colors"
            style={{
              backgroundColor: enabled
                ? "var(--color-accent)"
                : "var(--color-border-default)",
            }}
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
              style={{
                left: enabled ? "calc(100% - 18px)" : "2px",
              }}
            />
          </button>
          <span className="text-xs" style={labelStyle}>
            {enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
      </div>

      {/* Conditions */}
      <div className="rounded-lg border p-4 space-y-4" style={cardStyle}>
        <h3
          className="text-sm font-semibold pb-3 border-b"
          style={{
            color: "var(--color-text-primary)",
            borderColor: "var(--color-border-muted)",
          }}
        >
          Conditions
        </h3>

        {(type === "address_activity" || type === "failed_tx") && (
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={labelStyle}>
              Watch Address
            </label>
            <input
              type="text"
              value={conditions.address ?? ""}
              onChange={(e) =>
                setConditions({ ...conditions, address: e.target.value })
              }
              placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f..."
              className="w-full px-3 py-2 rounded-md border text-sm"
              style={inputStyle}
            />
          </div>
        )}

        {type === "contract_event" && (
          <>
            <div>
              <label
                className="text-xs font-medium mb-1.5 block"
                style={labelStyle}
              >
                Contract Address
              </label>
              <input
                type="text"
                value={conditions.contractAddress ?? ""}
                onChange={(e) =>
                  setConditions({
                    ...conditions,
                    contractAddress: e.target.value,
                  })
                }
                placeholder="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={inputStyle}
              />
            </div>
            <div>
              <label
                className="text-xs font-medium mb-1.5 block"
                style={labelStyle}
              >
                Event Signature
              </label>
              <input
                type="text"
                value={conditions.eventSignature ?? ""}
                onChange={(e) =>
                  setConditions({
                    ...conditions,
                    eventSignature: e.target.value,
                  })
                }
                placeholder="Transfer(address,address,uint256)"
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={inputStyle}
              />
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                Full event signature with types, e.g.
                Transfer(address,address,uint256)
              </p>
            </div>
          </>
        )}

        {type === "function_call" && (
          <>
            <div>
              <label
                className="text-xs font-medium mb-1.5 block"
                style={labelStyle}
              >
                Contract Address
              </label>
              <input
                type="text"
                value={conditions.contractAddress ?? ""}
                onChange={(e) =>
                  setConditions({
                    ...conditions,
                    contractAddress: e.target.value,
                  })
                }
                placeholder="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={inputStyle}
              />
            </div>
            <div>
              <label
                className="text-xs font-medium mb-1.5 block"
                style={labelStyle}
              >
                Function Selector (4 bytes hex)
              </label>
              <input
                type="text"
                value={conditions.functionSelector ?? ""}
                onChange={(e) =>
                  setConditions({
                    ...conditions,
                    functionSelector: e.target.value,
                  })
                }
                placeholder="0xa9059cbb"
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={inputStyle}
              />
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                First 4 bytes of the keccak256 hash of the function signature
              </p>
            </div>
          </>
        )}

        {type === "balance_threshold" && (
          <>
            <div>
              <label
                className="text-xs font-medium mb-1.5 block"
                style={labelStyle}
              >
                Watch Address
              </label>
              <input
                type="text"
                value={conditions.address ?? ""}
                onChange={(e) =>
                  setConditions({ ...conditions, address: e.target.value })
                }
                placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f..."
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={inputStyle}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  className="text-xs font-medium mb-1.5 block"
                  style={labelStyle}
                >
                  Threshold (PLS)
                </label>
                <input
                  type="text"
                  value={conditions.threshold ?? ""}
                  onChange={(e) =>
                    setConditions({ ...conditions, threshold: e.target.value })
                  }
                  placeholder="1000"
                  className="w-full px-3 py-2 rounded-md border text-sm"
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  className="text-xs font-medium mb-1.5 block"
                  style={labelStyle}
                >
                  Direction
                </label>
                <select
                  value={conditions.direction ?? "below"}
                  onChange={(e) =>
                    setConditions({
                      ...conditions,
                      direction: e.target.value as "above" | "below",
                    })
                  }
                  className="w-full px-3 py-2 rounded-md border text-sm"
                  style={inputStyle}
                >
                  <option value="above">Above</option>
                  <option value="below">Below</option>
                </select>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Notification Channels */}
      <div className="rounded-lg border p-4 space-y-4" style={cardStyle}>
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--color-border-muted)" }}>
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
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            No notification channels configured. Alerts will still be recorded
            in history.
          </p>
        )}

        {notifications.map((channel, index) => (
          <div
            key={index}
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
                  updateChannel(index, {
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
                onClick={() => removeChannel(index)}
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
              <div>
                <label
                  className="text-xs font-medium mb-1 block"
                  style={labelStyle}
                >
                  {channel.type === "webhook" ? "Webhook URL" : `${channel.type.charAt(0).toUpperCase() + channel.type.slice(1)} Webhook URL`}
                </label>
                <input
                  type="text"
                  value={channel.url ?? channel.webhookUrl ?? ""}
                  onChange={(e) =>
                    updateChannel(index, {
                      url: e.target.value,
                      webhookUrl: e.target.value,
                    })
                  }
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-md border text-xs"
                  style={inputStyle}
                />
              </div>
            )}

            {channel.type === "telegram" && (
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
                    onChange={(e) =>
                      updateChannel(index, { botToken: e.target.value })
                    }
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
                    onChange={(e) =>
                      updateChannel(index, { chatId: e.target.value })
                    }
                    placeholder="-1001234567890"
                    className="w-full px-3 py-2 rounded-md border text-xs"
                    style={inputStyle}
                  />
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Save Button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !name || !type}
        className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
        style={{
          backgroundColor:
            saving || !name ? "var(--color-border-default)" : "var(--color-accent)",
          color: saving || !name ? "var(--color-text-muted)" : "white",
          cursor: saving || !name ? "not-allowed" : "pointer",
          opacity: saving || !name ? 0.6 : 1,
        }}
      >
        {saving ? "Saving..." : isEdit ? "Update Alert" : "Create Alert"}
      </button>
    </div>
  );
}
