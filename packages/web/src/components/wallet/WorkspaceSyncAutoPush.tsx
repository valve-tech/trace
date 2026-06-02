import { useEffect, useRef } from "react";
import { useWorkspaces } from "../../hooks/useWorkspaces";
import { useWorkspaceSync } from "../../hooks/useWorkspaceSync";
import { useWalletSigner } from "../../hooks/useWalletSigner";
import { loadWatermark, saveWatermark } from "../../lib/workspace/syncWatermark";

const DEBOUNCE_MS = 1500;

/**
 * Headless driver: subscribes to the IDB workspaces and pushes the encrypted
 * envelope to the server whenever the local store changes. Debounced so a
 * burst of edits (e.g. bulk paste of 50 addresses) collapses into one PUT.
 *
 * The `lastSeen` watermark is persisted per-address to IDB so that closing
 * and reopening a tab does NOT re-schedule a push for an unchanged workspace
 * — `pushIfDirty` would short-circuit, but the IDB read + status churn is
 * wasted work. Address-scoping keeps wallet switches honest (user B's first
 * push must fire even if user A's max was higher).
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
  const { address } = useWalletSigner();

  // Watermark of "the most recent local change we've seen." When it advances
  // and we're in-sync, schedule a push. Initialized from IDB once we know
  // which wallet is connected.
  const lastSeen = useRef<number>(0);
  const hydratedFor = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate / re-hydrate the watermark whenever the connected address changes.
  // A wallet switch resets lastSeen to that wallet's persisted value (0 for a
  // brand-new wallet) so future scheduling is correct per-identity.
  useEffect(() => {
    if (!address) {
      lastSeen.current = 0;
      hydratedFor.current = null;
      return;
    }
    if (hydratedFor.current === address) return;
    let cancelled = false;
    void loadWatermark(address).then((v) => {
      if (cancelled) return;
      lastSeen.current = v;
      hydratedFor.current = address;
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    if (status.kind !== "in-sync") return;
    if (!address) return;
    // Don't act until the watermark for the current address is loaded;
    // acting on the stale value would re-schedule the same push on every
    // tab open and defeat the persistence we just added.
    if (hydratedFor.current !== address) return;
    let max = 0;
    for (const w of workspaces) if (w.updatedAt > max) max = w.updatedAt;
    if (max <= lastSeen.current) return;
    lastSeen.current = max;
    // Best-effort persist — if IDB write fails the next tab will re-schedule
    // a no-op push, which is exactly the pre-watermark behaviour.
    void saveWatermark(address, max);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void pushIfDirty();
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [workspaces, status.kind, pushIfDirty, address]);

  return null;
}
