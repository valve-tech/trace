import { get, set } from "idb-keyval";
import {
  EMPTY_STORE,
  type Workspace,
  type WorkspaceItem,
  type WorkspaceItemKind,
  type WorkspaceStore,
} from "./types.js";

/**
 * IndexedDB-backed workspace store. The whole shape lives under one key as a
 * single JSON blob — workspaces are small (item counts in the tens, workspace
 * counts in the handfuls) so the read-amplification doesn't matter. This file
 * owns the on-disk shape; consumers (the hook in `useWorkspaces`) treat the
 * store as a CRUD opaque box.
 *
 * Concurrency note: every write is "load → mutate → write whole blob," which
 * is racy under concurrent tabs. Acceptable for v0 (workspaces are a single-
 * tab read-heavy feature); a future cloud-sync layer will need real conflict
 * resolution and would be the place to address this.
 */

const IDB_KEY = "valvetech-workspaces";

export async function loadStore(): Promise<WorkspaceStore> {
  const raw = await get<WorkspaceStore>(IDB_KEY);
  if (!raw || raw.schemaVersion !== 1) return EMPTY_STORE;
  return raw;
}

export async function saveStore(s: WorkspaceStore): Promise<void> {
  await set(IDB_KEY, s);
}

// -----------------------------------------------------------------------------
// Pure helpers (no IDB) — easy to unit-test without faking the DB.
// -----------------------------------------------------------------------------

/**
 * Lowercase 0x-prefixed hex for address / tx kinds; preserve block numbers
 * as-given (stringified decimals). Catches the common "user pasted MIXED case
 * tx hash" duplicate-detection failure.
 */
export function normalizeItemValue(kind: WorkspaceItemKind, value: string): string {
  const v = value.trim();
  if (kind === "block") return v;
  return v.toLowerCase();
}

function genId(): string {
  // crypto.randomUUID is available in every browser we target (Vite/React 19).
  // Fall back to a plain random-string so Node/jsdom tests don't have to
  // polyfill — the only requirement is "stable + unique within one store".
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ws-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function createWorkspace(name: string, description?: string): Workspace {
  const now = Date.now();
  return {
    id: genId(),
    name: name.trim(),
    description: description?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    items: [],
  };
}

interface NewItemInput {
  kind: WorkspaceItemKind;
  value: string;
  chainId?: number;
  label?: string;
}

/**
 * Return a NEW workspace with `input` appended. If an item with the same
 * (kind, normalized value, chainId) already exists, the workspace is returned
 * unchanged — the caller can detect the no-op by reference equality. This is
 * the load-bearing dedupe: users will paste lists with repeats and re-tap
 * "Add to Workspace" on the same address; silently ignoring is the right UX.
 */
export function addItem(ws: Workspace, input: NewItemInput): Workspace {
  const value = normalizeItemValue(input.kind, input.value);
  const dup = ws.items.find(
    (it) =>
      it.kind === input.kind &&
      it.value === value &&
      it.chainId === input.chainId,
  );
  if (dup) return ws;
  const item: WorkspaceItem = {
    id: genId(),
    kind: input.kind,
    value,
    chainId: input.chainId,
    label: input.label?.trim() || undefined,
    addedAt: Date.now(),
  };
  return { ...ws, items: [...ws.items, item], updatedAt: Date.now() };
}

export function removeItem(ws: Workspace, itemId: string): Workspace {
  const items = ws.items.filter((it) => it.id !== itemId);
  if (items.length === ws.items.length) return ws;
  return { ...ws, items, updatedAt: Date.now() };
}

export function renameWorkspace(ws: Workspace, name: string, description?: string): Workspace {
  return {
    ...ws,
    name: name.trim(),
    description: description?.trim() || undefined,
    updatedAt: Date.now(),
  };
}

// -----------------------------------------------------------------------------
// Composite IDB ops — convenience wrappers used by the hook.
// -----------------------------------------------------------------------------

export async function persistWorkspaces(workspaces: Workspace[]): Promise<void> {
  await saveStore({ schemaVersion: 1, workspaces });
}
