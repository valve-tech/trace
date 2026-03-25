import { useState, useRef, useCallback, useEffect } from "react";
import {
  createAction,
  updateAction,
  testAction,
  type Action,
  type ExecutionResult,
} from "../../api/actions";

// ---------------------------------------------------------------------------
// Templates per trigger type
// ---------------------------------------------------------------------------
const TEMPLATES: Record<string, string> = {
  block: `// Runs on every Nth block
async function handler(context) {
  const { event, rpc, secrets, storage } = context;

  const block = await rpc.getBlock(event.blockNumber);
  console.log("Block", event.blockNumber, "has", block.transactionCount, "txs");
}`,
  event: `// Runs when a matching contract event is emitted
async function handler(context) {
  const { event, rpc, secrets, storage } = context;

  console.log("Matched", event.matchCount, "logs in block", event.blockNumber);

  for (const log of event.matchedLogs) {
    console.log("Log from tx:", log.transactionHash);
  }
}`,
  periodic: `// Runs at a fixed interval
async function handler(context) {
  const { event, rpc, secrets, storage } = context;

  const count = (storage.get("runCount") || 0) + 1;
  storage.set("runCount", count);

  const block = await rpc.getBlock();
  console.log("Run #" + count + " at block", block.number);
}`,
  webhook: `// Runs when the webhook URL receives a POST request
async function handler(context) {
  const { event, rpc, secrets, storage } = context;

  console.log("Webhook received:", JSON.stringify(event.body));

  // Example: forward to an external API
  // const res = await fetch(secrets.WEBHOOK_URL, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ data: event.body }),
  // });
}`,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ActionEditorProps {
  action?: Action | null; // null/undefined = create mode
  onSaved: (action: Action) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ActionEditor({ action, onSaved, onCancel }: ActionEditorProps) {
  const isEdit = Boolean(action);

  const [name, setName] = useState(action?.name ?? "");
  const [code, setCode] = useState(action?.code ?? TEMPLATES["block"]!);
  const [triggerType, setTriggerType] = useState<string>(action?.triggerType ?? "block");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(
    action?.triggerConfig ?? {},
  );
  const [secrets, setSecrets] = useState<Array<{ key: string; value: string }>>(
    action?.secretKeys.map((k) => ({ key: k, value: "" })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const codeRef = useRef<HTMLTextAreaElement>(null);

  // When trigger type changes (and not in edit mode), update code template
  const handleTriggerTypeChange = useCallback(
    (newType: string) => {
      setTriggerType(newType);
      setTriggerConfig({});
      if (!isEdit && code === TEMPLATES[triggerType]) {
        setCode(TEMPLATES[newType] ?? "");
      }
    },
    [isEdit, code, triggerType],
  );

  // Handle tab key in code editor
  const handleCodeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newCode = code.substring(0, start) + "  " + code.substring(end);
        setCode(newCode);
        // Set cursor position after inserted spaces
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        });
      }
    },
    [code],
  );

  // Compute line numbers
  const lineCount = code.split("\n").length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  // Save
  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const secretsObj: Record<string, string> = {};
      for (const s of secrets) {
        if (s.key.trim()) {
          secretsObj[s.key.trim()] = s.value;
        }
      }

      if (isEdit && action) {
        const updated = await updateAction(action.id, {
          name: name.trim(),
          code,
          triggerType,
          triggerConfig,
          secrets: Object.keys(secretsObj).length > 0 ? secretsObj : undefined,
        });
        onSaved(updated);
      } else {
        const created = await createAction({
          name: name.trim(),
          code,
          triggerType,
          triggerConfig,
          secrets: Object.keys(secretsObj).length > 0 ? secretsObj : undefined,
        });
        onSaved(created);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Test
  const handleTest = async () => {
    if (!action) {
      setError("Save the action first before testing");
      return;
    }

    setTesting(true);
    setError(null);
    setTestResult(null);

    try {
      const result = await testAction(action.id, {
        type: "test",
        blockNumber: 12345,
        timestamp: new Date().toISOString(),
      });
      setTestResult(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  // Scroll sync for line numbers
  const lineNumRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const textarea = codeRef.current;
    const lineNumEl = lineNumRef.current;
    if (!textarea || !lineNumEl) return;

    const handleScroll = () => {
      lineNumEl.scrollTop = textarea.scrollTop;
    };
    textarea.addEventListener("scroll", handleScroll);
    return () => textarea.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {isEdit ? "Edit Action" : "Create Action"}
        </h2>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-md border transition-colors"
          style={{
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-secondary)",
            backgroundColor: "transparent",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          Cancel
        </button>
      </div>

      {/* Name */}
      <div>
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Action"
          className="w-full px-3 py-2 rounded-md border text-sm"
          style={{
            backgroundColor: "var(--color-bg-input)",
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-primary)",
          }}
        />
      </div>

      {/* Trigger Type */}
      <div>
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Trigger Type
        </label>
        <div className="flex gap-2">
          {["block", "event", "periodic", "webhook"].map((t) => (
            <button
              key={t}
              onClick={() => handleTriggerTypeChange(t)}
              className="px-3 py-1.5 text-sm rounded-md border transition-colors capitalize"
              style={{
                borderColor:
                  triggerType === t ? "var(--color-accent)" : "var(--color-border-default)",
                color:
                  triggerType === t ? "var(--color-accent)" : "var(--color-text-secondary)",
                backgroundColor:
                  triggerType === t ? "var(--color-accent-muted)" : "transparent",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Trigger Config (dynamic based on type) */}
      <div>
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Trigger Configuration
        </label>

        {triggerType === "block" && (
          <div>
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--color-text-muted)" }}
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
              className="w-40 px-3 py-2 rounded-md border text-sm"
              style={{
                backgroundColor: "var(--color-bg-input)",
                borderColor: "var(--color-border-default)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>
        )}

        {triggerType === "event" && (
          <div className="space-y-2">
            <div>
              <label
                className="block text-xs mb-1"
                style={{ color: "var(--color-text-muted)" }}
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
                className="w-full px-3 py-2 rounded-md border text-sm font-mono"
                style={{
                  backgroundColor: "var(--color-bg-input)",
                  borderColor: "var(--color-border-default)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>
            <div>
              <label
                className="block text-xs mb-1"
                style={{ color: "var(--color-text-muted)" }}
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
                className="w-full px-3 py-2 rounded-md border text-sm font-mono"
                style={{
                  backgroundColor: "var(--color-bg-input)",
                  borderColor: "var(--color-border-default)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>
          </div>
        )}

        {triggerType === "periodic" && (
          <div>
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--color-text-muted)" }}
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
              className="w-40 px-3 py-2 rounded-md border text-sm"
              style={{
                backgroundColor: "var(--color-bg-input)",
                borderColor: "var(--color-border-default)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>
        )}

        {triggerType === "webhook" && (
          <div>
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Webhook URL (auto-generated after saving)
            </label>
            {action?.webhookUrl ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}${action.webhookUrl}`}
                  className="flex-1 px-3 py-2 rounded-md border text-sm font-mono"
                  style={{
                    backgroundColor: "var(--color-bg-tertiary)",
                    borderColor: "var(--color-border-default)",
                    color: "var(--color-text-secondary)",
                  }}
                />
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      `${window.location.origin}${action.webhookUrl}`,
                    );
                  }}
                  className="px-3 py-2 text-sm rounded-md border transition-colors"
                  style={{
                    borderColor: "var(--color-border-default)",
                    color: "var(--color-text-secondary)",
                    backgroundColor: "transparent",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Copy
                </button>
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Save this action to generate a webhook URL.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Code Editor */}
      <div>
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Code
        </label>
        <div
          className="rounded-lg border overflow-hidden flex"
          style={{
            borderColor: "var(--color-border-default)",
            backgroundColor: "var(--color-bg-primary)",
          }}
        >
          {/* Line numbers */}
          <div
            ref={lineNumRef}
            className="select-none text-right py-3 overflow-hidden flex-shrink-0"
            style={{
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: "13px",
              lineHeight: "1.5",
              width: "3.5rem",
              backgroundColor: "var(--color-bg-secondary)",
              borderRight: "1px solid var(--color-border-muted)",
            }}
          >
            {lineNumbers.map((n) => (
              <div key={n} className="px-2">
                {n}
              </div>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            ref={codeRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleCodeKeyDown}
            spellCheck={false}
            className="flex-1 p-3 resize-none outline-none"
            style={{
              backgroundColor: "transparent",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: "13px",
              lineHeight: "1.5",
              minHeight: "300px",
              border: "none",
              tabSize: 2,
            }}
          />
        </div>
      </div>

      {/* Secrets */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label
            className="text-sm font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Secrets
          </label>
          <button
            onClick={() => setSecrets([...secrets, { key: "", value: "" }])}
            className="text-xs px-2 py-1 rounded border transition-colors"
            style={{
              borderColor: "var(--color-border-default)",
              color: "var(--color-text-secondary)",
              backgroundColor: "transparent",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            + Add Secret
          </button>
        </div>
        {secrets.length === 0 && (
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            No secrets configured. Secrets are available as context.secrets in your code.
          </p>
        )}
        <div className="space-y-2">
          {secrets.map((s, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={s.key}
                onChange={(e) => {
                  const updated = [...secrets];
                  updated[i] = { ...s, key: e.target.value };
                  setSecrets(updated);
                }}
                placeholder="KEY"
                className="w-40 px-2 py-1.5 rounded border text-xs font-mono"
                style={{
                  backgroundColor: "var(--color-bg-input)",
                  borderColor: "var(--color-border-default)",
                  color: "var(--color-text-primary)",
                }}
              />
              <input
                type="password"
                value={s.value}
                onChange={(e) => {
                  const updated = [...secrets];
                  updated[i] = { ...s, value: e.target.value };
                  setSecrets(updated);
                }}
                placeholder="value"
                className="flex-1 px-2 py-1.5 rounded border text-xs font-mono"
                style={{
                  backgroundColor: "var(--color-bg-input)",
                  borderColor: "var(--color-border-default)",
                  color: "var(--color-text-primary)",
                }}
              />
              <button
                onClick={() => setSecrets(secrets.filter((_, j) => j !== i))}
                className="text-xs px-2 py-1.5 rounded border transition-colors"
                style={{
                  borderColor: "var(--color-border-default)",
                  color: "var(--color-danger)",
                  backgroundColor: "transparent",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-danger-muted)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="p-3 rounded-md text-sm"
          style={{
            backgroundColor: "var(--color-danger-muted)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* Test Result */}
      {testResult && (
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: testResult.success
              ? "var(--color-success)"
              : "var(--color-danger)",
            backgroundColor: testResult.success
              ? "var(--color-success-muted)"
              : "var(--color-danger-muted)",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-sm font-medium"
              style={{
                color: testResult.success
                  ? "var(--color-success)"
                  : "var(--color-danger)",
              }}
            >
              Test {testResult.success ? "Passed" : "Failed"}
            </span>
            <span
              className="text-xs"
              style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}
            >
              {testResult.duration_ms}ms
            </span>
          </div>
          {testResult.stdout && (
            <pre
              className="text-xs p-2 rounded mt-2 overflow-x-auto"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {testResult.stdout}
            </pre>
          )}
          {testResult.stderr && (
            <pre
              className="text-xs p-2 rounded mt-2 overflow-x-auto"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-danger)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {testResult.stderr}
            </pre>
          )}
          {testResult.error && (
            <p
              className="text-xs mt-2"
              style={{ color: "var(--color-danger)" }}
            >
              Error: {testResult.error}
            </p>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            backgroundColor: saving ? "var(--color-accent-muted)" : "var(--color-accent)",
            color: "white",
          }}
          onMouseOver={(e) => {
            if (!saving) e.currentTarget.style.backgroundColor = "var(--color-accent-hover)";
          }}
          onMouseOut={(e) => {
            if (!saving) e.currentTarget.style.backgroundColor = "var(--color-accent)";
          }}
        >
          {saving ? "Saving..." : isEdit ? "Update Action" : "Create Action"}
        </button>
        {isEdit && (
          <button
            onClick={() => void handleTest()}
            disabled={testing}
            className="px-4 py-2 rounded-md text-sm font-medium border transition-colors"
            style={{
              borderColor: "var(--color-border-default)",
              color: testing ? "var(--color-text-muted)" : "var(--color-text-secondary)",
              backgroundColor: "transparent",
            }}
            onMouseOver={(e) => {
              if (!testing) e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {testing ? "Running..." : "Test Run"}
          </button>
        )}
      </div>
    </div>
  );
}
