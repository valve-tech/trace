import type {
  AlertType,
  NotificationChannel,
} from "../../../api/alerts";

export const ALERT_TYPES: { value: AlertType; label: string }[] = [
  { value: "address_activity", label: "Address Activity" },
  { value: "contract_event", label: "Contract Event" },
  { value: "function_call", label: "Function Call" },
  { value: "balance_threshold", label: "Balance Threshold" },
  { value: "failed_tx", label: "Failed Transaction" },
];

export const CHANNEL_TYPES: {
  value: NotificationChannel["type"];
  label: string;
}[] = [
  { value: "webhook", label: "Webhook" },
  { value: "discord", label: "Discord" },
  { value: "slack", label: "Slack" },
  { value: "telegram", label: "Telegram" },
];
