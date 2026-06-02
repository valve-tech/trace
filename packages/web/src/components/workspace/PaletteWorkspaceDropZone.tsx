import { useState } from "react";
import { Icon } from "@iconify/react";
import { useWorkspaces } from "../../hooks/useWorkspaces";
import type { WorkspaceItemKind } from "../../lib/workspace/types";

export const PALETTE_ENTITY_MIME = "application/x-explore-entity";

export interface PaletteEntityPayload {
  kind: WorkspaceItemKind;
  value: string;
}

/**
 * In-palette drop overlay that appears when the user starts dragging a
 * result row. Each workspace is a drop target; releasing over one calls
 * addToWorkspace with the payload extracted from dataTransfer. Sits as an
 * absolute-positioned panel inside the palette modal, so the underlying
 * results stay visible (just dimmed).
 *
 * Rendered only while `visible` to avoid binding global handlers when
 * nothing is being dragged.
 */
export function PaletteWorkspaceDropZone({
  visible,
  onComplete,
}: {
  visible: boolean;
  onComplete: () => void;
}) {
  const { workspaces, create, addToWorkspace } = useWorkspaces();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  if (!visible) return null;

  const consumePayload = (e: React.DragEvent): PaletteEntityPayload | null => {
    const raw = e.dataTransfer.getData(PALETTE_ENTITY_MIME);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PaletteEntityPayload;
      if (!parsed.kind || !parsed.value) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const handleDrop = async (e: React.DragEvent, workspaceId: string) => {
    e.preventDefault();
    setHoverId(null);
    const payload = consumePayload(e);
    if (!payload) return;
    await addToWorkspace.mutateAsync({ id: workspaceId, ...payload });
    onComplete();
  };

  const handleDropOnNew = async (e: React.DragEvent) => {
    e.preventDefault();
    setHoverId(null);
    const payload = consumePayload(e);
    if (!payload || !newName.trim()) return;
    const ws = await create.mutateAsync({ name: newName.trim() });
    await addToWorkspace.mutateAsync({ id: ws.id, ...payload });
    setNewName("");
    setCreating(false);
    onComplete();
  };

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col p-4"
      style={{ backgroundColor: "rgba(20, 22, 28, 0.95)" }}
    >
      <div className="text-[10px] uppercase tracking-widest theme-text-muted mb-3">
        Drop into a workspace
      </div>
      <div className="flex-1 overflow-y-auto space-y-tight">
        {workspaces.map((w) => {
          const hovered = hoverId === w.id;
          return (
            <div
              key={w.id}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(PALETTE_ENTITY_MIME)) return;
                e.preventDefault();
                setHoverId(w.id);
              }}
              onDragLeave={() => setHoverId((h) => (h === w.id ? null : h))}
              onDrop={(e) => void handleDrop(e, w.id)}
              className="card p-3 flex items-center gap-row cursor-copy"
              style={{
                backgroundColor: hovered ? "var(--color-accent-muted)" : undefined,
                boxShadow: hovered
                  ? "inset 0 0 0 2px var(--color-accent)"
                  : undefined,
              }}
            >
              <Icon icon="heroicons:folder" className="w-4 h-4 theme-accent shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium theme-text truncate">{w.name}</div>
                <div className="text-[11px] theme-text-muted">
                  {w.items.length} {w.items.length === 1 ? "item" : "items"}
                </div>
              </div>
              {hovered && (
                <span className="text-[10px] uppercase tracking-widest theme-accent">
                  release
                </span>
              )}
            </div>
          );
        })}

        {creating ? (
          <div
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(PALETTE_ENTITY_MIME)) return;
              e.preventDefault();
              setHoverId("__new");
            }}
            onDragLeave={() => setHoverId((h) => (h === "__new" ? null : h))}
            onDrop={(e) => void handleDropOnNew(e)}
            className="card p-3"
            style={{
              backgroundColor: hoverId === "__new" ? "var(--color-accent-muted)" : undefined,
              boxShadow: hoverId === "__new" ? "inset 0 0 0 2px var(--color-accent)" : undefined,
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New workspace name…"
              className="w-full text-xs px-2 py-1.5 theme-primary-bg theme-text"
              style={{ boxShadow: "inset 0 0 0 1px var(--color-border-muted)" }}
            />
            <div className="text-[10px] theme-text-muted mt-1">
              Drop here to create &amp; add (name first).
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="card p-3 w-full text-left flex items-center gap-row theme-text-muted"
          >
            <Icon icon="heroicons:plus" className="w-4 h-4" />
            <span className="text-xs">New workspace…</span>
          </button>
        )}
      </div>

      <div className="text-[10px] theme-text-muted mt-3 text-center">
        Release outside any tile to cancel.
      </div>
    </div>
  );
}
