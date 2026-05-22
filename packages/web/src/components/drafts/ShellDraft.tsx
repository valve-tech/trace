import { useState, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "@iconify/react";

const NAV_GROUPS = [
  {
    label: "Inspect",
    hint: "Look at something that already happened",
    items: [
      { key: "explorer", label: "Explorer", icon: "heroicons:magnifying-glass" },
      { key: "debugger", label: "Debugger", icon: "heroicons:bug-ant" },
    ],
  },
  {
    label: "Simulate",
    hint: "Try something before you broadcast",
    items: [
      { key: "simulate", label: "Simulate", icon: "heroicons:play-circle" },
      { key: "fork", label: "Fork Sim", icon: "heroicons:arrows-right-left" },
      { key: "build", label: "Build Tx", icon: "heroicons:wrench-screwdriver" },
      { key: "bundle", label: "Bundle", icon: "heroicons:queue-list" },
      { key: "testnets", label: "TestNets", icon: "heroicons:beaker" },
    ],
  },
  {
    label: "Automate",
    hint: "Keep something running in the background",
    items: [
      { key: "monitoring", label: "Monitoring", icon: "heroicons:bell-alert" },
      { key: "actions", label: "Actions", icon: "heroicons:bolt" },
      { key: "rpc", label: "RPC", icon: "heroicons:server" },
    ],
  },
] as const;

const RECENT = [
  { kind: "tx", label: "0x9c41…f3a2", sub: "Reverted · 18m ago", status: "danger" },
  { kind: "addr", label: "PulseX Router", sub: "0x165C…AA29", status: "muted" },
  { kind: "tx", label: "0x4ade…81b0", sub: "Success · 2h ago", status: "success" },
  { kind: "fork", label: "fork-prod-snap", sub: "Block 21,840,194", status: "muted" },
] as const;

/**
 * Routes that bring their own side rails. Sidebar auto-collapses when active.
 * This list lives here for now; will move into a settings panel.
 */
const AUTO_COLLAPSE_KEYS = new Set(["debugger", "explorer"]);

const COLLAPSED_STORAGE_KEY = "valvetech-shell-sidebar-collapsed";
const AUTO_COLLAPSE_ENABLED_KEY = "valvetech-shell-auto-collapse";

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch {
    return fallback;
  }
}

export default function ShellDraft({
  content,
  activeKey,
}: {
  content?: ReactNode;
  activeKey?: string;
}) {
  const location = useLocation();
  const [active, setActive] = useState(activeKey ?? "");
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Manual user pref (persists)
  const [userCollapsed, setUserCollapsed] = useState(() =>
    loadBool(COLLAPSED_STORAGE_KEY, false),
  );
  const autoCollapseEnabled = loadBool(AUTO_COLLAPSE_ENABLED_KEY, true);

  // Auto-collapse if the active route is panel-heavy
  const autoCollapsed = autoCollapseEnabled && AUTO_COLLAPSE_KEYS.has(active);
  const collapsed = userCollapsed || autoCollapsed;

  // Persist manual pref
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(userCollapsed));
    } catch {
      /* ignore */
    }
  }, [userCollapsed]);

  // ⌘K palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div
      className="flex"
      style={{ height: "calc(100vh - 8rem)", backgroundColor: "var(--color-bg-primary)" }}
    >
      <Sidebar
        collapsed={collapsed}
        autoCollapsed={autoCollapsed}
        userCollapsed={userCollapsed}
        active={active}
        onActiveChange={setActive}
        onToggleCollapse={() => setUserCollapsed((c) => !c)}
        settingsActive={location.pathname.endsWith("/settings")}
      />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <CommandBar onOpen={() => setPaletteOpen(true)} />

        <div className="flex-1 overflow-auto">
          {content ?? <HomeView />}
        </div>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                            */
/* ------------------------------------------------------------------ */

function Sidebar({
  collapsed,
  autoCollapsed,
  userCollapsed,
  active,
  onActiveChange,
  onToggleCollapse,
  settingsActive,
}: {
  collapsed: boolean;
  autoCollapsed: boolean;
  userCollapsed: boolean;
  active: string;
  onActiveChange: (k: string) => void;
  onToggleCollapse: () => void;
  settingsActive: boolean;
}) {
  return (
    <aside
      className="flex flex-col transition-[width] duration-150"
      style={{
        width: collapsed ? 56 : 240,
        backgroundColor: "var(--color-bg-secondary)",
        boxShadow: "inset -1px 0 0 0 var(--color-border-default)",
      }}
    >
      <div
        className="px-3 py-3 flex items-center justify-between"
        style={{ boxShadow: "inset 0 -1px 0 0 var(--color-border-muted)" }}
      >
        {!collapsed && (
          <Link
            to="/drafts"
            className="text-xs flex items-center gap-1.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Icon icon="heroicons:chevron-left" className="w-3 h-3" />
            Back to drafts
          </Link>
        )}
        <button
          onClick={onToggleCollapse}
          title={
            autoCollapsed && !userCollapsed
              ? "Sidebar auto-collapsed for this route — click to keep it collapsed"
              : userCollapsed
                ? "Expand sidebar"
                : "Collapse sidebar"
          }
          className="p-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          <Icon
            icon={collapsed ? "heroicons:bars-3" : "heroicons:chevron-double-left"}
            className="w-4 h-4"
          />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            {!collapsed && (
              <>
                <div
                  className="px-4 mb-1 text-[10px] uppercase tracking-widest font-semibold"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {group.label}
                </div>
                <div
                  className="px-4 mb-2 text-[11px] italic"
                  style={{ color: "var(--color-text-muted)", opacity: 0.7 }}
                >
                  {group.hint}
                </div>
              </>
            )}
            {collapsed && (
              <div
                className="mx-3 mb-1 h-px"
                style={{ backgroundColor: "var(--color-border-muted)" }}
              />
            )}
            {group.items.map((item) => {
              const isActive = active === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => onActiveChange(item.key)}
                  title={collapsed ? item.label : undefined}
                  className="w-full flex items-center gap-2.5 py-1.5 text-sm transition-colors text-left"
                  style={{
                    paddingLeft: collapsed ? 0 : 16,
                    paddingRight: collapsed ? 0 : 16,
                    justifyContent: collapsed ? "center" : "flex-start",
                    backgroundColor: isActive ? "var(--color-accent-muted)" : "transparent",
                    color: isActive ? "var(--color-accent)" : "var(--color-text-secondary)",
                    boxShadow: isActive
                      ? "inset 2px 0 0 0 var(--color-accent)"
                      : "inset 2px 0 0 0 transparent",
                  }}
                >
                  <Icon icon={item.icon} className="w-4 h-4 shrink-0" />
                  {!collapsed && item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div
        className="px-3 py-2 text-xs flex items-center gap-2"
        style={{
          boxShadow: "inset 0 1px 0 0 var(--color-border-muted)",
          color: "var(--color-text-muted)",
        }}
      >
        <Link
          to="/drafts/shell/settings"
          className="flex items-center gap-2 flex-1"
          style={{
            color: settingsActive ? "var(--color-accent)" : "var(--color-text-muted)",
            textDecoration: "none",
          }}
          title={collapsed ? "Settings" : undefined}
        >
          <Icon icon="heroicons:cog-6-tooth" className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
        {!collapsed && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="w-1.5 h-1.5"
              style={{ backgroundColor: "var(--color-success)", borderRadius: "9999px" }}
            />
            <span style={{ fontSize: 10 }}>21.8M</span>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Command bar (top, opens palette)                                   */
/* ------------------------------------------------------------------ */

function CommandBar({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      className="px-6 py-3 flex items-center gap-3"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        boxShadow: "inset 0 -1px 0 0 var(--color-border-default)",
      }}
    >
      <button
        onClick={onOpen}
        className="flex-1 max-w-2xl flex items-center gap-3 px-3 py-2 text-sm text-left"
        style={{
          backgroundColor: "var(--color-bg-input)",
          color: "var(--color-text-muted)",
          boxShadow: "inset 0 0 0 1px var(--color-border-default)",
        }}
      >
        <Icon icon="heroicons:magnifying-glass" className="w-4 h-4" />
        <span className="flex-1">Paste a tx hash, address, block, or function selector…</span>
        <span
          className="text-[10px] px-1.5 py-0.5 font-mono"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            color: "var(--color-text-secondary)",
          }}
        >
          ⌘K
        </span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Default workspace content                                          */
/* ------------------------------------------------------------------ */

function HomeView() {
  return (
    <div className="p-6">
      <div className="mb-5">
        <div
          className="text-xs uppercase tracking-widest mb-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          Home
        </div>
        <h2 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Pick up where you left off
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div
            className="text-xs uppercase tracking-widest mb-3"
            style={{ color: "var(--color-text-muted)" }}
          >
            Recent
          </div>
          {RECENT.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2.5"
              style={{
                boxShadow:
                  i < RECENT.length - 1 ? "inset 0 -1px 0 0 var(--color-border-muted)" : undefined,
              }}
            >
              <div className="flex items-center gap-3">
                <Icon
                  icon={r.kind === "tx" ? "heroicons:hashtag" : r.kind === "addr" ? "heroicons:identification" : "heroicons:beaker"}
                  className="w-4 h-4"
                  style={{ color: "var(--color-text-muted)" }}
                />
                <div>
                  <div className="text-sm font-mono" style={{ color: "var(--color-text-primary)" }}>
                    {r.label}
                  </div>
                  <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {r.sub}
                  </div>
                </div>
              </div>
              <span
                className="w-1.5 h-1.5"
                style={{
                  backgroundColor:
                    r.status === "danger" ? "var(--color-danger)"
                    : r.status === "success" ? "var(--color-success)"
                    : "var(--color-text-muted)",
                  borderRadius: "9999px",
                }}
              />
            </div>
          ))}
        </div>

        <div className="card p-5">
          <div
            className="text-xs uppercase tracking-widest mb-3"
            style={{ color: "var(--color-text-muted)" }}
          >
            Suggested next
          </div>
          {[
            { label: "Re-run the reverted 0x9c41 with state overrides", icon: "heroicons:arrow-path" },
            { label: "Diff PulseX Router v1 vs v2 source", icon: "heroicons:document-duplicate" },
            { label: "Set an alert when fork-prod-snap drifts > 1h", icon: "heroicons:bell-alert" },
          ].map((s, i, arr) => (
            <button
              key={i}
              className="w-full flex items-center gap-3 py-2.5 text-left"
              style={{
                boxShadow:
                  i < arr.length - 1 ? "inset 0 -1px 0 0 var(--color-border-muted)" : undefined,
              }}
            >
              <Icon icon={s.icon} className="w-4 h-4" style={{ color: "var(--color-accent)" }} />
              <span className="text-sm flex-1" style={{ color: "var(--color-text-primary)" }}>
                {s.label}
              </span>
              <Icon
                icon="heroicons:arrow-right"
                className="w-3.5 h-3.5"
                style={{ color: "var(--color-text-muted)" }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Command palette                                                    */
/* ------------------------------------------------------------------ */

function CommandPalette({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-32 z-50"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div className="card w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ boxShadow: "inset 0 -1px 0 0 var(--color-border-default)" }}
        >
          <Icon
            icon="heroicons:magnifying-glass"
            className="w-4 h-4"
            style={{ color: "var(--color-text-muted)" }}
          />
          <input
            autoFocus
            placeholder="0xabc… or PulseX Router or 21840194 or transfer(address,uint256)"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--color-text-primary)" }}
          />
          <kbd
            className="text-[10px] px-1.5 py-0.5 font-mono"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-secondary)",
            }}
          >
            esc
          </kbd>
        </div>
        <div className="px-2 py-2">
          {[
            { label: "Inspect · tx hash", icon: "heroicons:hashtag" },
            { label: "Inspect · address / contract", icon: "heroicons:identification" },
            { label: "Inspect · block number", icon: "heroicons:cube" },
            { label: "Decode · 4byte selector", icon: "heroicons:code-bracket" },
            { label: "Simulate · this call", icon: "heroicons:play-circle" },
          ].map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-2 py-2 text-sm cursor-pointer"
              style={{
                color: "var(--color-text-secondary)",
                backgroundColor: i === 0 ? "var(--color-bg-tertiary)" : "transparent",
              }}
            >
              <Icon icon={s.icon} className="w-4 h-4" />
              <span className="flex-1">{s.label}</span>
              {i === 0 && (
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  ↵
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
