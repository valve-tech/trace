import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useSidebarState } from "./AppShell/useSidebarState";
import { useCommandPaletteShortcut } from "./AppShell/useCommandPaletteShortcut";
import { TopBar } from "./AppShell/TopBar";
import { Sidebar } from "./AppShell/Sidebar";
import { CommandPalette } from "./AppShell/CommandPalette";
import type { ApiStatus } from "./AppShell/types";

export default function AppShell({
  apiStatus,
  children,
}: {
  apiStatus: ApiStatus;
  children: ReactNode;
}) {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { collapsed, autoCollapsed, intent, onToggleCollapse } =
    useSidebarState(location.pathname);

  useCommandPaletteShortcut(setPaletteOpen);

  return (
    <div
      className="h-full flex flex-col min-h-0 theme-primary-bg"
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
