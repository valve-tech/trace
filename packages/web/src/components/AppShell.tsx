import { useState, useEffect, useMemo, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { useRecentEntities } from "../hooks/useRecentEntities";
import type { RecentEntity } from "../lib/recentEntities";

const NAV_GROUPS = [
  {
    label: "Inspect",
    hint: "Look at something that already happened",
    items: [
      { to: "/explorer", label: "Explorer", icon: "heroicons:magnifying-glass" },
      { to: "/mempool", label: "Mempool", icon: "heroicons:queue-list" },
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

const SIDEBAR_INTENT_KEY = "valvetech-shell-sidebar-intent";
const AUTO_COLLAPSE_ENABLED_KEY = "valvetech-shell-auto-collapse";

type SidebarIntent = "auto" | "collapsed" | "expanded";

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch {
    return fallback;
  }
}

function loadIntent(): SidebarIntent {
  try {
    const v = localStorage.getItem(SIDEBAR_INTENT_KEY);
    if (v === "collapsed" || v === "expanded" || v === "auto") return v;
  } catch {
    /* ignore */
  }
  return "auto";
}

type ApiStatus = "connected" | "disconnected" | "checking";

function PulseLogo() {
  return (
    <div className="relative pulse-icon flex items-center justify-center w-7 h-7">
      <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
        <circle cx="16" cy="16" r="14" fill="#8B5CF6" />
        <path
          d="M8 18 L12 10 L16 20 L20 8 L24 18"
          stroke="white"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function AppShell({
  apiStatus,
  children,
}: {
  apiStatus: ApiStatus;
  children: ReactNode;
}) {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [intent, setIntent] = useState<SidebarIntent>(loadIntent);
  const autoCollapseEnabled = loadBool(AUTO_COLLAPSE_ENABLED_KEY, true);

  const autoCollapsed = useMemo(
    () =>
      autoCollapseEnabled &&
      AUTO_COLLAPSE_PATHS.some((p) => location.pathname.startsWith(p)),
    [autoCollapseEnabled, location.pathname],
  );

  // Intent always wins. "auto" defers to the route's auto-collapse rule.
  // Click on the toggle promotes the *current* display to a sticky intent,
  // so the user can always escape an auto-collapsed route.
  const collapsed =
    intent === "collapsed" || (intent === "auto" && autoCollapsed);

  const onToggleCollapse = () => {
    setIntent(collapsed ? "expanded" : "collapsed");
  };

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_INTENT_KEY, intent);
    } catch {
      /* ignore */
    }
  }, [intent]);

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
      className="h-full flex flex-col min-h-0"
      style={{ backgroundColor: "var(--color-bg-primary)" }}
    >
      <TopBar
        collapsed={collapsed}
        autoCollapsed={autoCollapsed}
        intent={intent}
        onToggleCollapse={onToggleCollapse}
        apiStatus={apiStatus}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className="flex-1 flex min-h-0">
        <Sidebar collapsed={collapsed} />
        <div className="flex-1 overflow-auto min-w-0 p-3 md:p-4">{children}</div>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top bar — one row: controls · brand · ⌘K · status                  */
/* ------------------------------------------------------------------ */

function TopBar({
  collapsed,
  autoCollapsed,
  intent,
  onToggleCollapse,
  apiStatus,
  onOpenPalette,
}: {
  collapsed: boolean;
  autoCollapsed: boolean;
  intent: SidebarIntent;
  onToggleCollapse: () => void;
  apiStatus: ApiStatus;
  onOpenPalette: () => void;
}) {
  const navigate = useNavigate();
  // Subscribe to location so the back button's disabled state stays fresh.
  useLocation();
  const canGoBack =
    ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

  const toggleTitle =
    intent === "auto" && autoCollapsed
      ? "Auto-collapsed for this route — expand"
      : collapsed
        ? "Expand sidebar"
        : "Collapse sidebar";

  const statusColor =
    apiStatus === "connected"
      ? "var(--color-success)"
      : apiStatus === "disconnected"
        ? "var(--color-danger)"
        : "var(--color-warning)";
  const statusText =
    apiStatus === "connected"
      ? "Connected"
      : apiStatus === "disconnected"
        ? "Disconnected"
        : "Checking…";

  // Square controls (w == bar height) pinned to the far left, independent of
  // the sidebar width animation since the bar spans the full window.
  const control =
    "flex items-center justify-center shrink-0 w-12 h-12 transition-opacity";
  const controlBorder = "1px 0 0 0 var(--color-border-muted)";

  return (
    <div
      className="flex items-stretch h-12 shrink-0"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        boxShadow: "0 1px 0 0 var(--color-border-default)",
      }}
    >
      <button
        onClick={onToggleCollapse}
        title={toggleTitle}
        aria-label={toggleTitle}
        className={`${control} hover:opacity-80`}
        style={{ color: "var(--color-text-secondary)", backgroundColor: "transparent", boxShadow: controlBorder }}
      >
        <Icon
          icon={collapsed ? "heroicons:bars-3" : "heroicons:chevron-double-left"}
          className="w-5 h-5"
        />
      </button>

      <button
        onClick={() => navigate(-1)}
        disabled={!canGoBack}
        title="Back"
        aria-label="Go back"
        className={`${control} enabled:hover:opacity-80 disabled:opacity-30 disabled:cursor-default`}
        style={{ color: "var(--color-text-secondary)", backgroundColor: "transparent", boxShadow: controlBorder }}
      >
        <Icon icon="heroicons:arrow-left" className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-inline px-4 shrink-0">
        <PulseLogo />
        <h1
          className="text-sm font-semibold hidden md:block"
          style={{ color: "var(--color-text-primary)" }}
        >
          PulseChain Dev Platform
        </h1>
        <span
          className="text-[10px] uppercase tracking-wider px-2 py-0.5 font-semibold"
          style={{
            backgroundColor: "var(--color-accent-muted)",
            color: "var(--color-accent)",
          }}
        >
          Devnet
        </span>
      </div>

      <div className="flex-1 flex items-center px-3 min-w-0">
        <button
          onClick={onOpenPalette}
          className="w-full max-w-2xl flex items-center gap-inline px-3 h-8 text-sm text-left"
          style={{
            backgroundColor: "var(--color-bg-input)",
            color: "var(--color-text-muted)",
            boxShadow: "0 0 0 1px var(--color-border-default)",
          }}
        >
          <Icon
            icon="heroicons:magnifying-glass"
            className="w-4 h-4 shrink-0"
            style={{ color: "var(--color-text-muted)" }}
          />
          <span className="flex-1 truncate">
            Paste a tx hash, address, block, or function selector…
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 font-mono shrink-0"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-secondary)",
            }}
          >
            ⌘K
          </span>
        </button>
      </div>

      <div
        className="flex items-center gap-inline px-4 shrink-0 text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <span className="w-2 h-2" style={{ backgroundColor: statusColor }} />
        <span className="hidden sm:inline">{statusText}</span>
      </div>
    </div>
  );
}

function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className="flex flex-col transition-[width] duration-150 shrink-0"
      style={{
        width: collapsed ? 56 : 240,
        backgroundColor: "var(--color-bg-secondary)",
        boxShadow: "1px 0 0 0 var(--color-border-default)",
      }}
    >
      <nav className="flex-1 overflow-y-auto py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            {!collapsed && (
              <div
                className="px-4 mb-2 flex items-center gap-tight text-[10px] uppercase tracking-widest font-semibold"
                style={{ color: "var(--color-text-muted)" }}
              >
                <span>{group.label}</span>
                <span className="group/info relative inline-flex items-center">
                  <button
                    type="button"
                    aria-label={`${group.label}: ${group.hint}`}
                    className="opacity-50 hover:opacity-100 transition-opacity"
                  >
                    <Icon icon="heroicons:information-circle" className="w-3 h-3" />
                  </button>
                  <span
                    role="tooltip"
                    className="card pointer-events-none absolute top-full left-0 mt-1 z-50 hidden group-hover/info:block w-44 px-2 py-1.5 text-[11px] leading-snug normal-case tracking-normal font-normal"
                    style={{
                      backgroundColor: "var(--color-bg-card)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {group.hint}
                  </span>
                </span>
              </div>
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
                className="flex items-center transition-colors overflow-hidden"
                style={({ isActive }) =>
                  collapsed
                    ? {
                        width: 40,
                        height: 36,
                        marginLeft: "auto",
                        marginRight: "auto",
                        justifyContent: "center",
                        backgroundColor: isActive
                          ? "var(--color-accent-muted)"
                          : "transparent",
                        color: isActive
                          ? "var(--color-accent)"
                          : "var(--color-text-secondary)",
                        textDecoration: "none",
                      }
                    : {
                        width: "100%",
                        gap: 10,
                        paddingLeft: 16,
                        paddingRight: 16,
                        paddingTop: 8,
                        paddingBottom: 8,
                        backgroundColor: isActive
                          ? "var(--color-accent-muted)"
                          : "transparent",
                        color: isActive
                          ? "var(--color-accent)"
                          : "var(--color-text-secondary)",
                        boxShadow: isActive
                          ? "inset 2px 0 0 0 var(--color-accent)"
                          : "inset 2px 0 0 0 transparent",
                        textDecoration: "none",
                      }
                }
              >
                <Icon icon={item.icon} className="w-5 h-5 shrink-0" />
                {!collapsed && (
                  <span className="text-sm whitespace-nowrap">{item.label}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div
        className="py-2 flex items-center"
        style={{
          boxShadow: "0 -1px 0 0 var(--color-border-muted)",
          color: "var(--color-text-muted)",
          paddingLeft: collapsed ? 0 : 12,
          paddingRight: collapsed ? 0 : 12,
          gap: collapsed ? 0 : 8,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <NavLink
          to="/settings"
          title={collapsed ? "Settings" : undefined}
          className="flex items-center transition-colors"
          style={({ isActive }) =>
            collapsed
              ? {
                  width: 40,
                  height: 40,
                  justifyContent: "center",
                  color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
                  textDecoration: "none",
                }
              : {
                  flex: 1,
                  gap: 8,
                  paddingLeft: 8,
                  paddingRight: 8,
                  paddingTop: 6,
                  paddingBottom: 6,
                  fontSize: 12,
                  color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
                  textDecoration: "none",
                }
          }
        >
          <Icon icon="heroicons:cog-6-tooth" className="w-5 h-5 shrink-0" />
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

/* ------------------------------------------------------------------ */
/* Palette result model                                               */
/* ------------------------------------------------------------------ */

type ResultGroup = "Jump to" | "Recent" | "Contracts" | "Pages";
type PaletteTab = "all" | "recent" | "contracts" | "pages";

const TABS: { key: PaletteTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "recent", label: "Recent" },
  { key: "contracts", label: "Contracts" },
  { key: "pages", label: "Pages" },
];

interface Result {
  id: string;
  group: ResultGroup;
  tag: string;
  label: string;
  detail: string;
  icon: string;
  to: string;
}

/** Flattened navigable pages, derived from the sidebar groups. */
const PAGES: { label: string; to: string; icon: string }[] = NAV_GROUPS.flatMap(
  (g) => g.items.map((it) => ({ label: it.label, to: it.to, icon: it.icon })),
);

function truncMid(v: string): string {
  if (!v.startsWith("0x") || v.length <= 16) return v;
  return `${v.slice(0, 8)}…${v.slice(-6)}`;
}

function recentToResult(e: RecentEntity): Result {
  const to =
    e.kind === "tx"
      ? `/explorer?tx=${e.value}`
      : e.kind === "block"
        ? `/explorer?block=${e.value}`
        : `/explorer?address=${e.value}`;
  return {
    id: `${e.kind}:${e.value}`,
    group: e.kind === "contract" ? "Contracts" : "Recent",
    tag: e.kind,
    label: e.label ?? (e.value.startsWith("0x") ? truncMid(e.value) : `#${e.value}`),
    detail: e.label ? truncMid(e.value) : e.kind === "tx" && e.status ? e.status : e.kind,
    icon:
      e.kind === "tx"
        ? "heroicons:bug-ant"
        : e.kind === "block"
          ? "heroicons:cube"
          : e.kind === "contract"
            ? "heroicons:document-text"
            : "heroicons:identification",
    to,
  };
}

function matches(q: string, ...fields: (string | undefined)[]): boolean {
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}

/** Build the visible, ordered result list for the current query + tab. */
function buildResults(
  value: string,
  parsed: Parsed,
  recents: RecentEntity[],
  tab: PaletteTab,
): Result[] {
  const q = value.trim().toLowerCase();

  const jump: Result[] =
    parsed.kind === "unknown"
      ? []
      : parsed.actions.map((a) => ({
          id: a.to,
          group: "Jump to" as const,
          tag: parsed.kind,
          label: a.label,
          detail: a.detail,
          icon: a.icon,
          to: a.to,
        }));

  const recentResults = recents
    .filter((e) => matches(q, e.label, e.value))
    .map(recentToResult);
  const contracts = recentResults.filter((r) => r.group === "Contracts");
  const recentOnly = recentResults.filter((r) => r.group === "Recent");

  const pages: Result[] = PAGES.filter((p) => matches(q, p.label, p.to)).map(
    (p) => ({
      id: `page:${p.to}`,
      group: "Pages",
      tag: "page",
      label: p.label,
      detail: p.to,
      icon: p.icon,
      to: p.to,
    }),
  );

  switch (tab) {
    case "recent":
      return [...recentOnly, ...contracts];
    case "contracts":
      return contracts;
    case "pages":
      return pages;
    case "all":
      // Empty query → lead with what the user has touched, hide page noise.
      if (q === "") return [...recentOnly, ...contracts];
      return [...jump, ...contracts, ...recentOnly, ...pages];
  }
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const recents = useRecentEntities();
  const [value, setValue] = useState("");
  const [tab, setTab] = useState<PaletteTab>("all");
  const [selected, setSelected] = useState(0);
  const parsed = useMemo(() => parseInput(value), [value]);

  const results = useMemo(
    () => buildResults(value, parsed, recents, tab),
    [value, parsed, recents, tab],
  );

  // Reset the highlight whenever the visible set changes.
  useEffect(() => setSelected(0), [value, tab]);

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Tab") {
      e.preventDefault();
      const idx = TABS.findIndex((t) => t.key === tab);
      const next = TABS[(idx + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length]!;
      setTab(next.key);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[selected];
      if (r) go(r.to);
    }
  };

  // Render results with a group label whenever the group changes.
  let lastGroup: ResultGroup | null = null;

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-32 z-50"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div className="card w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div
          className="palette-row relative flex items-center px-4 h-12"
          style={{ boxShadow: "0 1px 0 0 var(--color-border-default)" }}
        >
          <Icon
            icon="heroicons:magnifying-glass"
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "var(--color-text-muted)" }}
          />
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search recent, contracts, pages — or paste a hash / address / block"
            className="bare-input flex-1 h-full pl-7 bg-transparent text-sm outline-none font-mono"
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
            className="text-[10px] px-2 py-1 font-mono shrink-0 ml-2"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-secondary)",
            }}
          >
            esc
          </kbd>
        </div>

        {/* Scope tabs */}
        <div
          className="flex items-center gap-tight px-3 pt-2"
          style={{ boxShadow: "0 1px 0 0 var(--color-border-muted)" }}
        >
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="text-[11px] px-3 py-1.5 transition-colors"
                style={{
                  color: on ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  boxShadow: on ? "inset 0 -2px 0 0 var(--color-accent)" : "none",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <div className="py-2 max-h-[50vh] overflow-y-auto">
            {results.map((r, i) => {
              const isSel = i === selected;
              const showGroup = r.group !== lastGroup;
              lastGroup = r.group;
              return (
                <div key={r.id}>
                  {showGroup && (
                    <div
                      className="text-[9px] uppercase tracking-widest px-4 pt-2 pb-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {r.group}
                    </div>
                  )}
                  <button
                    onClick={() => go(r.to)}
                    onMouseEnter={() => setSelected(i)}
                    className="w-full flex items-center gap-row px-4 py-2.5 text-left transition-colors"
                    style={{
                      backgroundColor: isSel ? "var(--color-accent-muted)" : "transparent",
                      boxShadow: isSel ? "inset 2px 0 0 0 var(--color-accent)" : "none",
                    }}
                  >
                    <Icon
                      icon={r.icon}
                      className="w-4 h-4 shrink-0"
                      style={{
                        color: isSel ? "var(--color-accent)" : "var(--color-text-secondary)",
                      }}
                    />
                    <span
                      className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 shrink-0"
                      style={{
                        backgroundColor: "var(--color-bg-tertiary)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {r.tag}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-sm font-mono truncate leading-snug"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {r.label}
                      </div>
                      <div
                        className="text-[11px] truncate"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {r.detail}
                      </div>
                    </div>
                    {isSel && (
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
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
            {value.trim() === ""
              ? "Nothing viewed yet — paste a tx hash, address, block number, or 4byte selector, or jump to a page from the Pages tab."
              : "No matches. Paste a full tx hash, address, block number, or 4byte selector to open it directly."}
          </div>
        )}

        <div
          className="flex items-center gap-row px-4 py-2 text-[10px]"
          style={{
            color: "var(--color-text-muted)",
            boxShadow: "0 -1px 0 0 var(--color-border-muted)",
          }}
        >
          <span>
            <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> open
          </span>
          <span>
            <kbd className="font-mono">tab</kbd> switch scope
          </span>
        </div>
      </div>
    </div>
  );
}
