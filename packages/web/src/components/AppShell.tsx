import { useState, useEffect, useMemo, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";

const NAV_GROUPS = [
  {
    label: "Inspect",
    hint: "Look at something that already happened",
    items: [
      { to: "/explorer", label: "Explorer", icon: "heroicons:magnifying-glass" },
      { to: "/debugger", label: "Debugger", icon: "heroicons:bug-ant" },
      { to: "/storage", label: "Storage", icon: "heroicons:rectangle-stack" },
      { to: "/diff", label: "Contract Diff", icon: "heroicons:document-duplicate" },
    ],
  },
  {
    label: "Simulate",
    hint: "Try something before you broadcast",
    items: [
      { to: "/simulate", label: "Simulate", icon: "heroicons:play-circle" },
      { to: "/fork", label: "Fork Sim", icon: "heroicons:arrows-right-left" },
      { to: "/build", label: "Build Tx", icon: "heroicons:wrench-screwdriver" },
      { to: "/bundle", label: "Bundle", icon: "heroicons:queue-list" },
      { to: "/testnets", label: "TestNets", icon: "heroicons:beaker" },
    ],
  },
  {
    label: "Automate",
    hint: "Keep something running in the background",
    items: [
      { to: "/monitoring", label: "Monitoring", icon: "heroicons:bell-alert" },
      { to: "/actions", label: "Actions", icon: "heroicons:bolt" },
      { to: "/rpc", label: "RPC", icon: "heroicons:server" },
    ],
  },
] as const;

/**
 * Routes that bring their own side rails. Sidebar auto-collapses when active.
 * Eventually editable from the settings panel.
 */
const AUTO_COLLAPSE_PATHS = ["/debugger", "/explorer", "/storage"];

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

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userCollapsed, setUserCollapsed] = useState(() =>
    loadBool(COLLAPSED_STORAGE_KEY, false),
  );
  const autoCollapseEnabled = loadBool(AUTO_COLLAPSE_ENABLED_KEY, true);

  const autoCollapsed = useMemo(
    () =>
      autoCollapseEnabled &&
      AUTO_COLLAPSE_PATHS.some((p) => location.pathname.startsWith(p)),
    [autoCollapseEnabled, location.pathname],
  );
  const collapsed = userCollapsed || autoCollapsed;

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(userCollapsed));
    } catch {
      /* ignore */
    }
  }, [userCollapsed]);

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
    <div className="h-full flex" style={{ backgroundColor: "var(--color-bg-primary)" }}>
      <Sidebar
        collapsed={collapsed}
        userCollapsed={userCollapsed}
        autoCollapsed={autoCollapsed}
        onToggleCollapse={() => setUserCollapsed((c) => !c)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <CommandBar onOpen={() => setPaletteOpen(true)} />
        <div className="flex-1 overflow-auto">{children}</div>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

function Sidebar({
  collapsed,
  userCollapsed,
  autoCollapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  userCollapsed: boolean;
  autoCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <aside
      className="flex flex-col transition-[width] duration-150 shrink-0"
      style={{
        width: collapsed ? 56 : 240,
        backgroundColor: "var(--color-bg-secondary)",
        boxShadow: "inset -1px 0 0 0 var(--color-border-default)",
      }}
    >
      <div
        className="px-3 py-3 flex items-center justify-end"
        style={{ boxShadow: "inset 0 -1px 0 0 var(--color-border-muted)" }}
      >
        <button
          onClick={onToggleCollapse}
          title={
            autoCollapsed && !userCollapsed
              ? "Auto-collapsed for this route — click to keep it collapsed"
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
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className="w-full flex items-center gap-2.5 py-1.5 text-sm transition-colors text-left"
                style={({ isActive }) => ({
                  paddingLeft: collapsed ? 0 : 16,
                  paddingRight: collapsed ? 0 : 16,
                  justifyContent: collapsed ? "center" : "flex-start",
                  backgroundColor: isActive ? "var(--color-accent-muted)" : "transparent",
                  color: isActive ? "var(--color-accent)" : "var(--color-text-secondary)",
                  boxShadow: isActive
                    ? "inset 2px 0 0 0 var(--color-accent)"
                    : "inset 2px 0 0 0 transparent",
                  textDecoration: "none",
                })}
              >
                <Icon icon={item.icon} className="w-4 h-4 shrink-0" />
                {!collapsed && item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{
          boxShadow: "inset 0 1px 0 0 var(--color-border-muted)",
          color: "var(--color-text-muted)",
        }}
      >
        <NavLink
          to="/settings"
          title={collapsed ? "Settings" : undefined}
          className="flex items-center gap-2 flex-1 text-xs"
          style={({ isActive }) => ({
            color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
            textDecoration: "none",
          })}
        >
          <Icon icon="heroicons:cog-6-tooth" className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        {!collapsed && (
          <NavLink
            to="/drafts"
            className="text-[10px] uppercase tracking-widest"
            style={({ isActive }) => ({
              color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
              textDecoration: "none",
            })}
          >
            Drafts ✶
          </NavLink>
        )}
      </div>
    </aside>
  );
}

function CommandBar({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      className="px-6 py-3 flex items-center gap-3 shrink-0"
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
/* Command palette — parse + route                                    */
/* ------------------------------------------------------------------ */

type PaletteAction = {
  label: string;
  detail: string;
  icon: string;
  to: string;
};

type Parsed =
  | { kind: "tx"; value: string; actions: PaletteAction[] }
  | { kind: "address"; value: string; actions: PaletteAction[] }
  | { kind: "block"; value: string; actions: PaletteAction[] }
  | { kind: "selector"; value: string; actions: PaletteAction[] }
  | { kind: "unknown" };

const HEX_TX = /^0x[a-fA-F0-9]{64}$/;
const HEX_ADDR = /^0x[a-fA-F0-9]{40}$/;
const HEX_SELECTOR = /^0x[a-fA-F0-9]{8}$/;
const DIGITS = /^\d+$/;

function parseInput(raw: string): Parsed {
  const v = raw.trim();
  if (v === "") return { kind: "unknown" };

  if (HEX_TX.test(v)) {
    return {
      kind: "tx",
      value: v,
      actions: [
        {
          label: "Open in Debugger",
          detail: "Step through opcodes, view call tree and gas profile",
          icon: "heroicons:bug-ant",
          to: `/debugger/${v}`,
        },
        {
          label: "Open in Explorer",
          detail: "Decoded inputs, events, internal txs, token transfers",
          icon: "heroicons:magnifying-glass",
          to: `/explorer?tx=${v}`,
        },
      ],
    };
  }

  if (HEX_ADDR.test(v)) {
    return {
      kind: "address",
      value: v,
      actions: [
        {
          label: "Open in Explorer",
          detail: "Recent activity, contract source, ABI",
          icon: "heroicons:magnifying-glass",
          to: `/explorer?address=${v}`,
        },
        {
          label: "Inspect storage layout",
          detail: "Pre-fills the storage viewer with this contract",
          icon: "heroicons:rectangle-stack",
          to: `/storage?address=${v}`,
        },
      ],
    };
  }

  if (HEX_SELECTOR.test(v)) {
    // No real destination yet — show the selector intent so we can wire it later.
    return {
      kind: "selector",
      value: v,
      actions: [
        {
          label: "Decode selector",
          detail: "Look up the function signature in the 4byte registry",
          icon: "heroicons:code-bracket",
          to: `/explorer?selector=${v}`,
        },
      ],
    };
  }

  if (DIGITS.test(v)) {
    return {
      kind: "block",
      value: v,
      actions: [
        {
          label: "Open block in Explorer",
          detail: "Transactions, gas usage, miner",
          icon: "heroicons:cube",
          to: `/explorer?block=${v}`,
        },
      ],
    };
  }

  return { kind: "unknown" };
}

const KIND_LABELS: Record<Exclude<Parsed["kind"], "unknown">, string> = {
  tx: "Transaction hash",
  address: "Address",
  block: "Block number",
  selector: "Function selector",
};

function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const parsed = useMemo(() => parseInput(value), [value]);

  const actions = parsed.kind === "unknown" ? [] : parsed.actions;
  const primary = actions[0];

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && primary) {
      e.preventDefault();
      go(primary.to);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-32 z-50"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div className="card w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        {/* Input row */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ boxShadow: "inset 0 -1px 0 0 var(--color-border-default)" }}
        >
          <Icon
            icon="heroicons:magnifying-glass"
            className="w-4 h-4 shrink-0"
            style={{ color: "var(--color-text-muted)" }}
          />
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Paste a tx hash, address, block number, or 4byte selector"
            className="flex-1 bg-transparent text-sm outline-none font-mono"
            style={{ color: "var(--color-text-primary)" }}
          />
          {parsed.kind !== "unknown" && (
            <span
              className="text-[10px] uppercase tracking-widest font-semibold px-2 py-1 shrink-0"
              style={{
                backgroundColor: "var(--color-accent-muted)",
                color: "var(--color-accent)",
              }}
            >
              {KIND_LABELS[parsed.kind]}
            </span>
          )}
          <kbd
            className="text-[10px] px-2 py-1 font-mono shrink-0"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-secondary)",
            }}
          >
            esc
          </kbd>
        </div>

        {/* Actions */}
        {actions.length > 0 && (
          <div className="py-2">
            {actions.map((a, i) => {
              const isPrimary = i === 0;
              return (
                <button
                  key={a.to}
                  onClick={() => go(a.to)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
                  style={{
                    backgroundColor: isPrimary ? "var(--color-bg-tertiary)" : "transparent",
                  }}
                >
                  <Icon
                    icon={a.icon}
                    className="w-4 h-4 mt-0.5 shrink-0"
                    style={{
                      color: isPrimary ? "var(--color-accent)" : "var(--color-text-secondary)",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-sm font-medium leading-snug"
                      style={{
                        color: isPrimary ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                      }}
                    >
                      {a.label}
                    </div>
                    <div
                      className="text-xs leading-snug mt-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {a.detail}
                    </div>
                  </div>
                  {isPrimary && (
                    <kbd
                      className="text-[10px] px-2 py-1 font-mono shrink-0"
                      style={{
                        backgroundColor: "var(--color-bg-card)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      ↵
                    </kbd>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Empty / unrecognized states */}
        {value.trim() === "" && (
          <div className="px-4 py-3">
            <div
              className="text-[10px] uppercase tracking-widest mb-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              What you can paste
            </div>
            <ul className="space-y-1.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              <li>
                <code style={{ color: "var(--color-text-primary)" }}>0x…</code>
                <span className="ml-2" style={{ color: "var(--color-text-muted)" }}>
                  66 chars → tx hash · 42 chars → address · 10 chars → 4byte selector
                </span>
              </li>
              <li>
                <code style={{ color: "var(--color-text-primary)" }}>21840194</code>
                <span className="ml-2" style={{ color: "var(--color-text-muted)" }}>
                  pure digits → block number
                </span>
              </li>
            </ul>
          </div>
        )}

        {value.trim() !== "" && parsed.kind === "unknown" && (
          <div
            className="px-4 py-3 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            Not a tx hash, address, block number, or selector. Contract-name search
            is coming.
          </div>
        )}
      </div>
    </div>
  );
}
