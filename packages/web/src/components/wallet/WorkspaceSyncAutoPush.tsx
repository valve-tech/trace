import { useEffect, useRef } from "react";
import { useWorkspaces } from "../../hooks/useWorkspaces";
import { useWorkspaceSync } from "../../hooks/useWorkspaceSync";

const DEBOUNCE_MS = 1500;

/**
 * Headless driver: subscribes to the IDB workspaces and pushes the encrypted
 * envelope to the server whenever the local store changes. Debounced so a
 * burst of edits (e.g. bulk paste of 50 addresses) collapses into one PUT.
 *
 * Lives as a sibling to WorkspaceSyncStatus rather than being folded into
 * useWorkspaceSync because it's a "subscribe to data, side-effect" pattern
 * that wants to mount-once-per-app — making it a component lets us guarantee
 * single-instance via mount placement instead of an ad-hoc useRef sentinel
 * inside a hook that might be called from multiple places.
 */
export function WorkspaceSyncAutoPush() {
  const { workspaces } = useWorkspaces();
  const { status, pushIfDirty } = useWorkspaceSync();

  // Watermark of "the most recent local change we've seen." When it advances
  // and we're in-sync, schedule a push.
  const lastSeen = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status.kind !== "in-sync") return;
    let max = 0;
    for (const w of workspaces) if (w.updatedAt > max) max = w.updatedAt;
    if (max <= lastSeen.current) return;
    lastSeen.current = max;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void pushIfDirty();
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [workspaces, status.kind, pushIfDirty]);

  return null;
}
