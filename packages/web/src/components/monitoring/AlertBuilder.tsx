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
import { BasicInfoCard } from "./AlertBuilder/BasicInfoCard";
import { ConditionsCard } from "./AlertBuilder/ConditionsCard";
import { NotificationChannelsCard } from "./AlertBuilder/NotificationChannelsCard";

interface AlertBuilderProps {
  alert?: Alert | null;
  onSaved: () => void;
  onCancel: () => void;
}

export default function AlertBuilder({
  alert,
  onSaved,
  onCancel,
}: AlertBuilderProps) {
  const [name, setName] = useState(alert?.name ?? "");
  const [type, setType] = useState<AlertType>(
    alert?.type ?? "address_activity",
  );
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

  const handleTypeChange = (newType: AlertType) => {
    setType(newType);
    if (!isEdit) setConditions({});
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

  return (
    <div className="space-y-stack">
      <div className="flex items-center justify-between">
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {isEdit ? "Edit Alert" : "Create Alert"}
        </h2>
        <button
          onClick={onCancel}
          className="text-sm px-3 py-1.5 rounded-md bs"
          style={{
            color: "var(--color-text-secondary)",
            backgroundColor: "transparent",
          }}
        >
          Cancel
        </button>
      </div>

      {error && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: "var(--color-danger-muted)",
            borderColor: "var(--color-danger)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      <BasicInfoCard
        name={name}
        setName={setName}
        type={type}
        onTypeChange={handleTypeChange}
        cooldown={cooldown}
        setCooldown={setCooldown}
        enabled={enabled}
        setEnabled={setEnabled}
      />

      <ConditionsCard
        type={type}
        conditions={conditions}
        setConditions={setConditions}
      />

      <NotificationChannelsCard
        notifications={notifications}
        setNotifications={setNotifications}
      />

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !name || !type}
        className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
        style={{
          backgroundColor:
            saving || !name
              ? "var(--color-border-default)"
              : "var(--color-accent)",
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
