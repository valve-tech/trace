import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";

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
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <div
          className="text-xs uppercase tracking-widest mb-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          Settings
        </div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
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
            className="text-[10px] uppercase tracking-widest mb-2"
            style={{ color: "var(--color-text-muted)" }}
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
                <div className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                  {r.label}{" "}
                  <code
                    className="ml-1 text-[11px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    /{r.key}
                  </code>
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  {r.note}
                </div>
              </div>
              <div className="text-xs flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>
                <Icon icon="heroicons:arrow-down-right" className="w-3 h-3" />
                collapses
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Section: Future home for other prefs */}
      <Section title="More" icon="heroicons:adjustments-horizontal">
        <div
          className="text-xs italic py-4 text-center"
          style={{ color: "var(--color-text-muted)" }}
        >
          Network, RPC URL overrides, theme accents, default route, keyboard shortcuts —
          will live here as we add them.
        </div>
      </Section>
    </div>
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
        className="flex items-center gap-inline mb-4 text-xs uppercase tracking-widest"
        style={{ color: "var(--color-text-muted)" }}
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
        <div className="text-sm" style={{ color: "var(--color-text-primary)" }}>
          {label}
        </div>
        <div className="text-xs mt-0.5 max-w-md" style={{ color: "var(--color-text-muted)" }}>
          {hint}
        </div>
      </div>
      {control}
    </div>
  );
}
