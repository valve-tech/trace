import type { Action } from "../../../api/actions";
import { copyToClipboard } from "../../../lib/clipboard";

interface Props {
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  setTriggerConfig: (cfg: Record<string, unknown>) => void;
  webhookUrl: Action["webhookUrl"] | undefined;
}

export function TriggerConfigEditor({
  triggerType,
  triggerConfig,
  setTriggerConfig,
  webhookUrl,
}: Props) {
  return (
    <div>
      <label
        className="block text-sm font-medium mb-1.5 theme-text-secondary"
      >
        Trigger Configuration
      </label>

      {triggerType === "block" && (
        <div>
          <label
            className="block text-xs mb-1 theme-text-muted"
          >
            Run every Nth block
          </label>
          <input
            type="number"
            min={1}
            value={(triggerConfig.everyNthBlock as number) ?? 1}
            onChange={(e) =>
              setTriggerConfig({
                ...triggerConfig,
                everyNthBlock: parseInt(e.target.value, 10) || 1,
              })
            }
            className="w-40 px-3 py-2 rounded-md bs text-sm"
            style={{
              backgroundColor: "var(--color-bg-input)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>
      )}

      {triggerType === "event" && (
        <div className="space-y-2">
          <div>
            <label
              className="block text-xs mb-1 theme-text-muted"
            >
              Contract Address
            </label>
            <input
              type="text"
              value={(triggerConfig.contractAddress as string) ?? ""}
              onChange={(e) =>
                setTriggerConfig({
                  ...triggerConfig,
                  contractAddress: e.target.value,
                })
              }
              placeholder="0x..."
              className="w-full px-3 py-2 rounded-md bs text-sm font-mono"
              style={{
                backgroundColor: "var(--color-bg-input)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>
          <div>
            <label
              className="block text-xs mb-1 theme-text-muted"
            >
              Event Signature (topic0 hash)
            </label>
            <input
              type="text"
              value={(triggerConfig.eventSignature as string) ?? ""}
              onChange={(e) =>
                setTriggerConfig({
                  ...triggerConfig,
                  eventSignature: e.target.value,
                })
              }
              placeholder="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
              className="w-full px-3 py-2 rounded-md bs text-sm font-mono"
              style={{
                backgroundColor: "var(--color-bg-input)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>
        </div>
      )}

      {triggerType === "periodic" && (
        <div>
          <label
            className="block text-xs mb-1 theme-text-muted"
          >
            Interval (seconds)
          </label>
          <input
            type="number"
            min={10}
            value={(triggerConfig.intervalSeconds as number) ?? 60}
            onChange={(e) =>
              setTriggerConfig({
                ...triggerConfig,
                intervalSeconds: parseInt(e.target.value, 10) || 60,
              })
            }
            className="w-40 px-3 py-2 rounded-md bs text-sm"
            style={{
              backgroundColor: "var(--color-bg-input)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>
      )}

      {triggerType === "webhook" && (
        <div>
          <label
            className="block text-xs mb-1 theme-text-muted"
          >
            Webhook URL (auto-generated after saving)
          </label>
          {webhookUrl ? (
            <div className="flex items-center gap-inline">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}${webhookUrl}`}
                className="flex-1 px-3 py-2 rounded-md bs text-sm font-mono"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  color: "var(--color-text-secondary)",
                }}
              />
              <button
                onClick={() => {
                  void copyToClipboard(
                    `${window.location.origin}${webhookUrl}`,
                  );
                }}
                className="px-3 py-2 text-sm rounded-md bs transition-colors"
                style={{
                  color: "var(--color-text-secondary)",
                  backgroundColor: "transparent",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "var(--color-bg-tertiary)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                Copy
              </button>
            </div>
          ) : (
            <p
              className="text-xs theme-text-muted"
            >
              Save this action to generate a webhook URL.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
