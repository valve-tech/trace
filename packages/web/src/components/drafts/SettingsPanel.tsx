import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import {
  resolveApiBase,
  getApiBaseOverride,
  setApiBaseOverride,
  clearApiBaseOverride,
} from "../../lib/apiBase";

const AUTO_COLLAPSE_ENABLED_KEY = "valvetech-shell-auto-collapse";

const PANEL_HEAVY_ROUTES = [
  { key: "debugger", label: "Debugger", note: "Has call tree (left) + storage/stack/memory (right)" },
  { key: "explorer", label: "Explorer", note: "Has sub-tabs and table widths that benefit from horizontal space" },
];

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch {
    return fallback;
  }
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative w-9 h-5 transition-colors shrink-0"
      style={{
        backgroundColor: checked ? "var(--color-accent)" : "var(--color-bg-tertiary)",
        boxShadow: checked
          ? "0 0 0 1px var(--color-accent)"
          : "0 0 0 1px var(--color-border-default)",
      }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 transition-all"
        style={{
          left: checked ? 18 : 2,
          backgroundColor: "white",
          borderRadius: "9999px",
        }}
      />
    </button>
  );
}

export default function SettingsPanel() {
  const [autoCollapse, setAutoCollapse] = useState(() =>
    loadBool(AUTO_COLLAPSE_ENABLED_KEY, true),
  );

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_COLLAPSE_ENABLED_KEY, String(autoCollapse));
    } catch {
      /* ignore */
    }
  }, [autoCollapse]);

  return (
    <div className="p-4 max-w-3xl">
      <div className="mb-6">
        <div
          className="text-xs uppercase tracking-widest mb-1 theme-text-muted"
        >
          Settings
        </div>
        <h1 className="text-xl font-semibold theme-text">
          Workspace preferences
        </h1>
      </div>

      {/* Section: Sidebar */}
      <Section title="Sidebar" icon="heroicons:bars-3">
        <Row
          label="Auto-collapse on panel-heavy routes"
          hint="Auto-collapse the sidebar to icons when entering routes that already have their own side panels. Manual toggle still works."
          control={<Toggle checked={autoCollapse} onChange={setAutoCollapse} />}
        />
        <div className="pt-4 pb-2">
          <div
            className="text-[10px] uppercase tracking-widest mb-2 theme-text-muted"
          >
            Auto-collapse rules
          </div>
          {PANEL_HEAVY_ROUTES.map((r, i, arr) => (
            <div
              key={r.key}
              className={`flex items-start justify-between py-2.5${
                i < arr.length - 1 ? " bs-b-muted" : ""
              }`}
              style={{ opacity: autoCollapse ? 1 : 0.4 }}
            >
              <div>
                <div className="text-sm theme-text">
                  {r.label}{" "}
                  <code
                    className="ml-1 text-[11px] theme-text-muted"
                  >
                    /{r.key}
                  </code>
                </div>
                <div className="text-xs mt-0.5 theme-text-muted">
                  {r.note}
                </div>
              </div>
              <div className="text-xs flex items-center gap-1.5 theme-text-muted">
                <Icon icon="heroicons:arrow-down-right" className="w-3 h-3" />
                collapses
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Section: Backend API origin */}
      <BackendApiSection />

      {/* Section: Future home for other prefs */}
      <Section title="More" icon="heroicons:adjustments-horizontal">
        <div
          className="text-xs italic py-4 text-center theme-text-muted"
        >
          Network, theme accents, default route, keyboard shortcuts —
          will live here as we add them.
        </div>
      </Section>
    </div>
  );
}

/**
 * Backend API origin override (IPFS-portable frontend, recommendation B).
 *
 * `resolveApiBase()` reads the override once at module load, so a change here
 * only takes effect after a page reload — the UI states that plainly rather
 * than pretending the swap is live-reactive.
 */
function BackendApiSection() {
  const effective = resolveApiBase();
  const [draft, setDraft] = useState(() => getApiBaseOverride() ?? "");
  const [stored, setStored] = useState<string | null>(() => getApiBaseOverride());
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Enter an http(s) origin, e.g. https://explore.valve.city");
      return;
    }
    const saved = setApiBaseOverride(trimmed);
    if (!saved) {
      setError("Not a valid http(s) origin.");
      return;
    }
    setError(null);
    setStored(saved);
    setDraft(saved);
  };

  const clear = () => {
    clearApiBaseOverride();
    setStored(null);
    setDraft("");
    setError(null);
  };

  return (
    <Section title="Backend API origin" icon="heroicons:server-stack">
      <div className="space-y-stack pt-2">
        <div className="flex items-center justify-between gap-row">
          <span className="text-xs uppercase tracking-widest theme-text-muted">
            Currently using
          </span>
          <code className="text-xs theme-mono theme-text">
            {effective || "(same origin)"}
          </code>
        </div>

        <p className="text-xs theme-text-muted max-w-md">
          Override the backend this UI talks to. Needed when the app is served
          from an IPFS gateway and must point at a chosen backend. Only http(s)
          origins are accepted; the value is stored in this browser only.
        </p>

        <div className="flex items-center gap-row">
          <input
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply();
            }}
            placeholder="https://explore.valve.city"
            className={`w-full px-2 py-1.5 text-sm theme-mono theme-input-bg theme-text ${
              error ? "bs-b-danger" : "bs-in-muted"
            }`}
          />
          <button
            type="button"
            onClick={apply}
            className="px-4 py-2 text-sm font-medium theme-accent-solid text-white hover:opacity-90 shrink-0"
          >
            Set
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={stored === null}
            className={`px-4 py-2 text-sm font-medium shrink-0 ${
              stored === null
                ? "theme-tertiary-bg theme-text-muted cursor-not-allowed"
                : "theme-secondary-bg theme-text hover:opacity-90"
            }`}
          >
            Clear
          </button>
        </div>

        {error && (
          <div className="text-xs theme-danger">{error}</div>
        )}

        <div className="flex items-start gap-inline text-xs theme-text-muted">
          <Icon
            icon="heroicons:arrow-path"
            className="w-3.5 h-3.5 mt-0.5 shrink-0"
          />
          <span>
            {stored
              ? `Override set to ${stored}. `
              : "No override set. "}
            Reload the page for the change to take effect — the backend origin is
            resolved once when the app loads.
          </span>
        </div>
      </div>
    </Section>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 card p-5">
      <div
        className="flex items-center gap-inline mb-4 text-xs uppercase tracking-widest theme-text-muted"
      >
        <Icon icon={icon} className="w-3.5 h-3.5" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  hint,
  control,
}: {
  label: string;
  hint: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-sm theme-text">
          {label}
        </div>
        <div className="text-xs mt-0.5 max-w-md theme-text-muted">
          {hint}
        </div>
      </div>
      {control}
    </div>
  );
}
