import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { loadStore, persistWorkspaces } from "../lib/workspace/store";
import {
  decryptStoreEnvelope,
  encryptStoreEnvelope,
  getWorkspaceKey,
  _resetKeyCacheForTests,
} from "../lib/workspace/sync";
import {
  authenticate,
  logout as apiLogout,
  pullSync,
  pushSync,
  SyncUnauthorized,
  type PulledEnvelope,
} from "../lib/workspace/syncClient";
import type { WorkspaceStore } from "../lib/workspace/types";
import { useWalletSigner } from "./useWalletSigner";

/**
 * Workspace sync orchestrator. Composes:
 *   - useWalletSigner (slice 1) — connected wallet's viem signer
 *   - SIWE-lite auth     (slice 2) — POST /api/auth/verify → session cookie
 *   - blob sync          (slice 3) — GET/PUT /api/workspaces/sync
 *   - crypto             (sync.ts) — derive key + encrypt/decrypt envelope
 *   - local store        (store.ts) — IDB-backed workspaces
 *
 * Lifecycle:
 *   1. enable()        → sign challenge, mint session, derive key
 *   2. pull-on-enable  → fetch server envelope; if it exists, compare against
 *                        local. updatedAt comparison determines:
 *                          - server.updatedAt > local.updatedAt → "remote ahead"
 *                          - server.updatedAt < local.updatedAt → "local ahead"
 *                          - equal                              → in sync
 *                        Equal AND non-zero → just adopt the server blob.
 *                        Mismatch → emit a `conflict` state, wait for
 *                        resolveConflict('local' | 'remote').
 *   3. push-on-change  → callers invoke pushIfDirty() after any IDB-store
 *                        mutation. Debounced via a tracking ref so a burst
 *                        of edits coalesces into one PUT.
 *
 * Pulls + pushes are coordinated so a remote-driven re-pull doesn't fire
 * during an in-flight push (would clobber). The activeOp mutex is a
 * simple Promise chain — adequate for one-tab, one-wallet usage.
 */

export type SyncStatus =
  | { kind: "disabled" }
  | { kind: "authenticating" }
  | { kind: "pulling" }
  | { kind: "pushing" }
  | { kind: "in-sync"; serverUpdatedAt: number }
  | { kind: "conflict"; local: WorkspaceStore; remote: WorkspaceStore; remoteServerUpdatedAt: number }
  | { kind: "error"; message: string };

interface UseWorkspaceSyncReturn {
  status: SyncStatus;
  /** Begin the auth + initial pull flow. No-op if already enabled. */
  enable: () => Promise<void>;
  /** Push the current local store if it's newer than the last server pull. */
  pushIfDirty: () => Promise<void>;
  /** Force the local store onto the server (used to resolve a conflict). */
  resolveConflict: (winner: "local" | "remote") => Promise<void>;
  /** Disconnect: clear session cookie, drop in-memory state. */
  disable: () => Promise<void>;
}

export function useWorkspaceSync(): UseWorkspaceSyncReturn {
  const { signer, address, isConnected } = useWalletSigner();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<SyncStatus>({ kind: "disabled" });
  // The last server-side timestamp we successfully pulled or pushed. Used to
  // suppress pushes when the local store hasn't drifted past it.
  const lastServerUpdatedAt = useRef<number>(0);
  // Chains operations so we don't race a pull against a push.
  const opChain = useRef<Promise<unknown>>(Promise.resolve());

  /** Queue an operation behind any in-flight one. Returns its result. */
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const next = opChain.current.then(fn, fn);
    opChain.current = next.catch(() => {
      // Swallow so the chain doesn't permanently reject — each enqueued op
      // sees the original rejection via its own returned promise.
    });
    return next;
  }, []);

  const adoptRemote = useCallback(
    async (envelope: PulledEnvelope, key: CryptoKey) => {
      const remote = await decryptStoreEnvelope({ envelope, key });
      await persistWorkspaces(remote.workspaces);
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      lastServerUpdatedAt.current = envelope.serverUpdatedAt;
      setStatus({ kind: "in-sync", serverUpdatedAt: envelope.serverUpdatedAt });
    },
    [queryClient],
  );

  const enable = useCallback(async () => {
    if (!signer) {
      setStatus({ kind: "error", message: "Connect a wallet first" });
      return;
    }
    await enqueue(async () => {
      try {
        setStatus({ kind: "authenticating" });
        await authenticate(signer);
        setStatus({ kind: "pulling" });
        const key = await getWorkspaceKey({ signer });
        const remote = await pullSync();
        const local = await loadStore();
        const localUpdatedAt = mostRecentUpdate(local);
        if (!remote) {
          // First-time sync — push current local. If local is empty,
          // we still push so the server has a row to update later.
          const envelope = await encryptStoreEnvelope({ store: local, key });
          const { serverUpdatedAt } = await pushSync(envelope);
          lastServerUpdatedAt.current = serverUpdatedAt;
          setStatus({ kind: "in-sync", serverUpdatedAt });
          return;
        }
        if (remote.updatedAt === localUpdatedAt) {
          // Same edit timestamp — same data (in practice). Adopt remote so
          // any drift in object identity (workspace IDs, order) is
          // canonicalized to what the server stored.
          await adoptRemote(remote, key);
          return;
        }
        // Diverged — surface a conflict and let the user resolve.
        const remoteStore = await decryptStoreEnvelope({ envelope: remote, key });
        setStatus({
          kind: "conflict",
          local,
          remote: remoteStore,
          remoteServerUpdatedAt: remote.serverUpdatedAt,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "sync failed";
        setStatus({ kind: "error", message });
      }
    });
  }, [signer, enqueue, adoptRemote]);

  const pushIfDirty = useCallback(async () => {
    if (!signer) return;
    if (status.kind !== "in-sync") return; // never push from error/conflict/authenticating
    await enqueue(async () => {
      try {
        setStatus({ kind: "pushing" });
        const key = await getWorkspaceKey({ signer });
        const local = await loadStore();
        const localUpdatedAt = mostRecentUpdate(local);
        if (localUpdatedAt <= lastServerUpdatedAt.current) {
          // Nothing newer than the last server state we know about.
          setStatus({ kind: "in-sync", serverUpdatedAt: lastServerUpdatedAt.current });
          return;
        }
        const envelope = await encryptStoreEnvelope({ store: local, key });
        const { serverUpdatedAt } = await pushSync(envelope);
        lastServerUpdatedAt.current = serverUpdatedAt;
        setStatus({ kind: "in-sync", serverUpdatedAt });
      } catch (err) {
        if (err instanceof SyncUnauthorized) {
          // Cookie expired — drop back to disabled so the next `enable()`
          // re-authenticates instead of looping push-fail-push.
          setStatus({ kind: "disabled" });
          return;
        }
        const message = err instanceof Error ? err.message : "push failed";
        setStatus({ kind: "error", message });
      }
    });
  }, [signer, status, enqueue]);

  const resolveConflict = useCallback(
    async (winner: "local" | "remote") => {
      if (!signer) return;
      if (status.kind !== "conflict") return;
      const { local, remote, remoteServerUpdatedAt } = status;
      await enqueue(async () => {
        try {
          const key = await getWorkspaceKey({ signer });
          if (winner === "remote") {
            await persistWorkspaces(remote.workspaces);
            queryClient.invalidateQueries({ queryKey: ["workspaces"] });
            lastServerUpdatedAt.current = remoteServerUpdatedAt;
            setStatus({ kind: "in-sync", serverUpdatedAt: remoteServerUpdatedAt });
            return;
          }
          // Local wins: bump every workspace's updatedAt past the most-
          // recent remote workspace timestamp so future conflict detection
          // knows our copy is the newer.
          const remoteMax = mostRecentUpdate(remote);
          const bumped: WorkspaceStore = {
            ...local,
            workspaces: local.workspaces.map((w) => ({
              ...w,
              updatedAt: Math.max(w.updatedAt, remoteMax + 1),
            })),
          };
          await persistWorkspaces(bumped.workspaces);
          queryClient.invalidateQueries({ queryKey: ["workspaces"] });
          const envelope = await encryptStoreEnvelope({ store: bumped, key });
          const { serverUpdatedAt } = await pushSync(envelope);
          lastServerUpdatedAt.current = serverUpdatedAt;
          setStatus({ kind: "in-sync", serverUpdatedAt });
        } catch (err) {
          const message = err instanceof Error ? err.message : "resolve failed";
          setStatus({ kind: "error", message });
        }
      });
    },
    [signer, status, enqueue, queryClient],
  );

  const disable = useCallback(async () => {
    await enqueue(async () => {
      await apiLogout();
      lastServerUpdatedAt.current = 0;
      _resetKeyCacheForTests(); // also clears the in-mem key derivation cache
      setStatus({ kind: "disabled" });
    });
  }, [enqueue]);

  // If the wallet disconnects, drop back to disabled — the session cookie
  // may still be valid, but the UX expectation is "wallet off → sync off".
  useEffect(() => {
    if (!isConnected && status.kind !== "disabled") {
      setStatus({ kind: "disabled" });
      lastServerUpdatedAt.current = 0;
    }
  }, [isConnected, status.kind]);

  // Address-change detector — switching wallets in MetaMask should force
  // re-auth, not silently push the new wallet's empty store to the old
  // wallet's row.
  const lastAddress = useRef<string | undefined>(address);
  useEffect(() => {
    if (address !== lastAddress.current) {
      lastAddress.current = address;
      if (status.kind !== "disabled") {
        setStatus({ kind: "disabled" });
        lastServerUpdatedAt.current = 0;
      }
    }
  }, [address, status.kind]);

  return { status, enable, pushIfDirty, resolveConflict, disable };
}

function mostRecentUpdate(store: WorkspaceStore): number {
  let max = 0;
  for (const ws of store.workspaces) if (ws.updatedAt > max) max = ws.updatedAt;
  return max;
}
