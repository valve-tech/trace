/**
 * Workspaces are named, heterogeneous bookmark buckets — a user can group
 * addresses, transactions, and blocks they're investigating together (e.g.
 * "Lido incident 2026-05", "PulseX swap research") without forcing a single
 * shape on the items. Each item is a reference to an entity that lives at its
 * existing canonical URL (/address/0x…, /tx/0x…, /block/N); the Workspace
 * itself is the meta-view that ties them together.
 *
 * v0 is local-only (IndexedDB), but the schema carries a `schemaVersion` so a
 * future opt-in cloud sync can migrate cleanly.
 */

export type WorkspaceItemKind = "address" | "tx" | "block";

export interface WorkspaceItem {
  /** Stable ID for list keys + remove. Generated at insert time. */
  id: string;
  kind: WorkspaceItemKind;
  /**
   * The canonical identifier for the item's kind:
   *   - "address" / "tx" → lower-cased 0x-prefixed hex
   *   - "block" → decimal block number as a string (room for very large blocks
   *     on chains where number > 2^53 — we store as string to be future-proof)
   */
  value: string;
  /**
   * The chain this item is pinned to. Every item carries one — the same
   * address exists on multiple chains, and previews/links must hit the chain
   * the user filed the item from, not whatever chain is active later.
   * Items persisted before pinning landed are defaulted to 369 (PulseChain,
   * the only chain that existed then) by `loadStore`'s normalization.
   */
  chainId: number;
  /** Optional user-supplied note (e.g. "the proxy", "this is the bug tx"). */
  label?: string;
  /** ms epoch — used for ordering and for "added 3h ago" displays. */
  addedAt: number;
}

export interface Workspace {
  /** Stable ID — used in /workspace/:id URLs and as the React list key. */
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  items: WorkspaceItem[];
}

/**
 * The IndexedDB blob shape. Single blob for v0 — workspaces are small (tens of
 * items each, most users have a handful of workspaces) so the read-amplification
 * of "load all, write all" doesn't matter and there's no concurrency to handle.
 * Promoting to per-workspace keys is a clean rewrite if + when needed.
 */
export interface WorkspaceStore {
  schemaVersion: 1;
  workspaces: Workspace[];
}

export const EMPTY_STORE: WorkspaceStore = {
  schemaVersion: 1,
  workspaces: [],
};
