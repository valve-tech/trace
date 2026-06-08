import { useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { useWorkspaces } from "../../hooks/useWorkspaces";
import { Tooltip } from "../primitives/Tooltip";

/**
 * Persistent "file this tx's touched contracts into a workspace" affordance for
 * the debugger. Renders as a single quiet icon button (tooltip on hover/focus)
 * that opens the same batch-add picker as before — every touched contract plus
 * the tx itself, filed in one click.
 *
 * Deliberately NOT a banner and NOT dismissable: the icon always persists once
 * a trace has touched contracts, so the action is discoverable without nagging.
 */
export function DebuggerWorkspaceSuggest({
  txHash,
  addresses,
}: {
  txHash: string;
  addresses: string[];
}) {
  const { workspaces, create, addToWorkspace } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const dedupedAddrs = useMemo(
    () => [...new Set(addresses.map((a) => a.toLowerCase()))],
    [addresses],
  );

  if (dedupedAddrs.length === 0) return null;

  const batchAdd = async (workspaceId: string) => {
    setAdding(true);
    try {
      for (const addr of dedupedAddrs) {
        await addToWorkspace.mutateAsync({
          id: workspaceId,
          kind: "address",
          value: addr,
        });
      }
      // Always add the tx itself too — it's the entry point that ties the
      // contracts together; users almost always want it filed alongside.
      await addToWorkspace.mutateAsync({
        id: workspaceId,
        kind: "tx",
        value: txHash,
      });
      setJustAdded(workspaceId);
      // Close the picker after the confirmation flashes; the icon persists.
      setTimeout(() => {
        setOpen(false);
        setJustAdded(null);
      }, 1000);
    } finally {
      setAdding(false);
    }
  };

  const handleCreateAndAdd = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const ws = await create.mutateAsync({ name: newName.trim() });
    await batchAdd(ws.id);
    setNewName("");
  };

  const totalToFile = dedupedAddrs.length + 1; // contracts + the tx
  const tooltipLabel = `File ${dedupedAddrs.length} ${
    dedupedAddrs.length === 1 ? "contract" : "contracts"
  } + this tx into a workspace`;

  return (
    <div className="flex justify-end mb-2">
      <div className="relative">
        <Tooltip label={tooltipLabel} side="bottom">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={tooltipLabel}
            aria-expanded={open}
            className="inline-flex items-center justify-center w-8 h-8 theme-accent transition-opacity hover:opacity-80"
            style={{ boxShadow: "0 0 0 1px var(--color-border-default)" }}
          >
            <Icon icon="heroicons:folder-plus" className="w-4 h-4" />
          </button>
        </Tooltip>

        {open && (
          <div
            className="absolute right-0 z-50 w-72 mt-1 card p-2 space-y-tight"
            style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
          >
            <div className="text-[10px] uppercase tracking-widest px-2 pt-1 pb-2 theme-text-muted">
              Add {totalToFile} items to…
            </div>

            {workspaces.length === 0 && (
              <div className="px-2 pb-2 text-xs theme-text-muted">
                No workspaces yet. Create one below to start filing.
              </div>
            )}

            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => void batchAdd(w.id)}
                disabled={adding}
                className="w-full text-left flex items-center justify-between gap-row px-2 py-1.5 text-xs theme-text"
                style={{
                  backgroundColor:
                    justAdded === w.id ? "var(--color-accent-muted)" : "transparent",
                  opacity: adding && justAdded !== w.id ? 0.5 : 1,
                }}
              >
                <span className="flex items-center gap-tight min-w-0">
                  <Icon
                    icon="heroicons:folder"
                    className="w-3.5 h-3.5 theme-accent shrink-0"
                  />
                  <span className="truncate">{w.name}</span>
                </span>
                {justAdded === w.id ? (
                  <Icon
                    icon="heroicons:check"
                    className="w-3.5 h-3.5 theme-success shrink-0"
                  />
                ) : (
                  <span className="text-[10px] font-mono theme-text-muted shrink-0">
                    {w.items.length}
                  </span>
                )}
              </button>
            ))}

            <form
              onSubmit={handleCreateAndAdd}
              className="px-1 pt-1"
              style={{ borderTop: "1px solid var(--color-border-muted)" }}
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Create new workspace and add…"
                className="w-full text-xs px-2 py-1.5 theme-primary-bg theme-text"
                style={{
                  boxShadow: "inset 0 0 0 1px var(--color-border-muted)",
                }}
              />
              {newName.trim() && (
                <button
                  type="submit"
                  disabled={adding}
                  className="mt-1 w-full text-xs px-2 py-1.5"
                  style={{
                    backgroundColor: "var(--color-accent)",
                    color: "#fff",
                    opacity: adding ? 0.5 : 1,
                  }}
                >
                  Create &quot;{newName.trim()}&quot; and add {totalToFile}
                </button>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
