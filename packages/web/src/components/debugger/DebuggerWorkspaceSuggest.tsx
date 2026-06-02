import { useMemo, useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { useWorkspaces } from "../../hooks/useWorkspaces";

const DISMISS_KEY_PREFIX = "valvetech-debugger-ws-suggest-dismissed:";

/**
 * Auto-suggest banner that surfaces after a debug trace loads: "N contracts
 * touched by this tx — file them into a workspace?" Reuses the same picker
 * shape as AddToWorkspaceButton, but for batch-add (every touched contract
 * in one click).
 *
 * Dismissable per-tx — once dismissed, doesn't reappear for that hash. The
 * dismiss flag is localStorage-scoped, not IDB, because it's pure UI noise
 * (no cross-device value, low-stakes if lost).
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
  const [dismissed, setDismissed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const dismissKey = `${DISMISS_KEY_PREFIX}${txHash.toLowerCase()}`;

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(dismissKey) === "1");
    } catch {
      // localStorage can throw in some sandboxes; treat as not dismissed.
    }
  }, [dismissKey]);

  const dedupedAddrs = useMemo(
    () => [...new Set(addresses.map((a) => a.toLowerCase()))],
    [addresses],
  );

  if (dismissed || dedupedAddrs.length === 0) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(dismissKey, "1");
    } catch {
      // ignore quota / mode errors
    }
    setDismissed(true);
  };

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
      setTimeout(() => {
        setOpen(false);
        handleDismiss();
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

  return (
    <div
      className="card p-3 mb-2 flex items-center gap-row"
      style={{ backgroundColor: "var(--color-accent-muted)" }}
    >
      <Icon icon="heroicons:folder-plus" className="w-4 h-4 theme-accent shrink-0" />
      <div className="flex-1 text-xs theme-text">
        <span className="font-medium">
          {dedupedAddrs.length} {dedupedAddrs.length === 1 ? "contract" : "contracts"}
        </span>{" "}
        touched by this tx.{" "}
        <span className="theme-text-muted">File them (and the tx) into a workspace?</span>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs px-3 py-1.5"
          style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
        >
          Pick workspace
        </button>

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

      <button
        type="button"
        onClick={handleDismiss}
        className="text-xs px-2 py-1 theme-text-muted"
        title="Dismiss for this tx"
      >
        <Icon icon="heroicons:x-mark" className="w-4 h-4" />
      </button>
    </div>
  );
}
