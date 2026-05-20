import { useCallback, useState } from "react";
import {
  createAction,
  updateAction,
  testAction,
  type Action,
  type ExecutionResult,
} from "../../api/actions";
import { TEMPLATES } from "./ActionEditor/templates";
import { TriggerConfigEditor } from "./ActionEditor/TriggerConfigEditor";
import { CodeEditor } from "./ActionEditor/CodeEditor";
import { SecretsEditor, type SecretEntry } from "./ActionEditor/SecretsEditor";
import { TestResultPanel } from "./ActionEditor/TestResultPanel";
import { EditorActions } from "./ActionEditor/EditorActions";
import { TriggerTypePicker } from "./ActionEditor/TriggerTypePicker";

interface ActionEditorProps {
  action?: Action | null;
  onSaved: (action: Action) => void;
  onCancel: () => void;
}

export default function ActionEditor({
  action,
  onSaved,
  onCancel,
}: ActionEditorProps) {
  const isEdit = Boolean(action);

  const [name, setName] = useState(action?.name ?? "");
  const [code, setCode] = useState(action?.code ?? TEMPLATES["block"]!);
  const [triggerType, setTriggerType] = useState<string>(
    action?.triggerType ?? "block",
  );
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(
    action?.triggerConfig ?? {},
  );
  const [secrets, setSecrets] = useState<SecretEntry[]>(
    action?.secretKeys.map((k) => ({ key: k, value: "" })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const payload = {
        name: name.trim(),
        code,
        triggerType,
        triggerConfig,
        secrets: Object.keys(secretsObj).length > 0 ? secretsObj : undefined,
      };

      const saved =
        isEdit && action
          ? await updateAction(action.id, payload)
          : await createAction(payload);
      onSaved(saved);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
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

      <TriggerTypePicker
        triggerType={triggerType}
        onChange={handleTriggerTypeChange}
      />

      <TriggerConfigEditor
        triggerType={triggerType}
        triggerConfig={triggerConfig}
        setTriggerConfig={setTriggerConfig}
        webhookUrl={action?.webhookUrl}
      />

      <CodeEditor code={code} setCode={setCode} />

      <SecretsEditor secrets={secrets} setSecrets={setSecrets} />

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

      {testResult && <TestResultPanel result={testResult} />}

      <EditorActions
        isEdit={isEdit}
        saving={saving}
        testing={testing}
        onSave={() => void handleSave()}
        onTest={() => void handleTest()}
      />
    </div>
  );
}
