import { useState, useEffect, useMemo } from "react";

/**
 * Routes that bring their own side rails. Sidebar auto-collapses when active.
 * Eventually editable from the settings panel.
 */
const AUTO_COLLAPSE_PATHS = ["/debugger", "/explorer", "/storage"];

const SIDEBAR_INTENT_KEY = "valvetech-shell-sidebar-intent";
const AUTO_COLLAPSE_ENABLED_KEY = "valvetech-shell-auto-collapse";

export type SidebarIntent = "auto" | "collapsed" | "expanded";

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

export interface SidebarState {
  collapsed: boolean;
  autoCollapsed: boolean;
  intent: SidebarIntent;
  onToggleCollapse: () => void;
}

/**
 * Owns the sidebar collapse state: a persisted intent plus a per-route
 * auto-collapse rule. Intent always wins; "auto" defers to the route's rule.
 */
export function useSidebarState(pathname: string): SidebarState {
  const [intent, setIntent] = useState<SidebarIntent>(loadIntent);
  const autoCollapseEnabled = loadBool(AUTO_COLLAPSE_ENABLED_KEY, true);

  const autoCollapsed = useMemo(
    () =>
      autoCollapseEnabled &&
      AUTO_COLLAPSE_PATHS.some((p) => pathname.startsWith(p)),
    [autoCollapseEnabled, pathname],
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

  return { collapsed, autoCollapsed, intent, onToggleCollapse };
}
