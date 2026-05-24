/**
 * Recently-viewed + pinned entity store, persisted to localStorage and shared
 * across the app (the Recent & Pinned rail and the ⌘K palette both read it).
 *
 * It's a tiny external store consumed via `useRecentEntities` (useSyncExternal-
 * Store). Snapshots are immutable: every mutation replaces the array reference
 * so React re-renders, and the reference is otherwise stable so it doesn't.
 */

export type EntityKind = "tx" | "address" | "contract" | "block";

export interface RecentEntity {
  kind: EntityKind;
  /** Canonical id — addresses/hashes lower-cased, block number as given. */
  value: string;
  /** Human label when known (e.g. a verified contract name). */
  label?: string;
  /** For txs: execution status, drives the kind dot colour. */
  status?: "success" | "reverted";
  pinned: boolean;
  visits: number;
  lastSeen: number;
}

const STORAGE_KEY = "explorer.recentEntities";
/** Cap on *unpinned* recents — pinned entries never expire. */
const MAX_RECENT = 24;

function idOf(kind: EntityKind, value: string): string {
  const v = value.startsWith("0x") ? value.toLowerCase() : value;
  // tx and address can never collide (different value shapes), but contract and
  // address share the 0x-address shape — key them apart by kind.
  return `${kind}:${v}`;
}

function canonical(value: string): string {
  return value.startsWith("0x") ? value.toLowerCase() : value;
}

function load(): RecentEntity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentEntity);
  } catch {
    return [];
  }
}

function isRecentEntity(v: unknown): v is RecentEntity {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.kind === "string" &&
    typeof e.value === "string" &&
    typeof e.pinned === "boolean" &&
    typeof e.visits === "number" &&
    typeof e.lastSeen === "number"
  );
}

/** Pinned first, then most-recent. Both groups newest-first within. */
function sort(list: RecentEntity[]): RecentEntity[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastSeen - a.lastSeen;
  });
}

let entities: RecentEntity[] = sort(load());
const listeners = new Set<() => void>();

function commit(next: RecentEntity[]): void {
  entities = sort(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entities));
  } catch {
    /* persistence is best-effort */
  }
  for (const l of listeners) l();
}

/* ---------------------------------------------------------------- */
/* External-store interface (for useSyncExternalStore)              */
/* ---------------------------------------------------------------- */

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): RecentEntity[] {
  return entities;
}

/* ---------------------------------------------------------------- */
/* Mutations                                                        */
/* ---------------------------------------------------------------- */

export function recordVisit(input: {
  kind: EntityKind;
  value: string;
  label?: string;
  status?: "success" | "reverted";
}): void {
  const value = canonical(input.value);
  const id = idOf(input.kind, value);
  const existing = entities.find((e) => idOf(e.kind, e.value) === id);

  if (existing) {
    commit(
      entities.map((e) =>
        idOf(e.kind, e.value) === id
          ? {
              ...e,
              label: input.label ?? e.label,
              status: input.status ?? e.status,
              visits: e.visits + 1,
              lastSeen: Date.now(),
            }
          : e,
      ),
    );
    return;
  }

  const fresh: RecentEntity = {
    kind: input.kind,
    value,
    label: input.label,
    status: input.status,
    pinned: false,
    visits: 1,
    lastSeen: Date.now(),
  };

  // Evict the oldest unpinned entry once we exceed the cap.
  const next = [fresh, ...entities];
  const unpinned = next.filter((e) => !e.pinned);
  if (unpinned.length > MAX_RECENT) {
    const evict = unpinned
      .sort((a, b) => a.lastSeen - b.lastSeen)
      .slice(0, unpinned.length - MAX_RECENT);
    const evictIds = new Set(evict.map((e) => idOf(e.kind, e.value)));
    commit(next.filter((e) => !evictIds.has(idOf(e.kind, e.value))));
  } else {
    commit(next);
  }
}

/**
 * Update an existing entry's label/status without creating one or bumping its
 * visit count. Detail views call this once their richer data loads (e.g. a
 * contract's name), so the palette can search by name. No-op if not present.
 */
export function enrichEntity(
  kind: EntityKind,
  value: string,
  patch: { label?: string; status?: "success" | "reverted" },
): void {
  const id = idOf(kind, canonical(value));
  const existing = entities.find((e) => idOf(e.kind, e.value) === id);
  if (!existing) return;
  const merged = { ...existing, ...patch };
  if (merged.label === existing.label && merged.status === existing.status) {
    return; // nothing changed — avoid a needless re-render
  }
  commit(
    entities.map((e) => (idOf(e.kind, e.value) === id ? merged : e)),
  );
}

export function togglePin(kind: EntityKind, value: string): void {
  const id = idOf(kind, value);
  commit(
    entities.map((e) =>
      idOf(e.kind, e.value) === id ? { ...e, pinned: !e.pinned } : e,
    ),
  );
}

export function removeEntity(kind: EntityKind, value: string): void {
  const id = idOf(kind, value);
  commit(entities.filter((e) => idOf(e.kind, e.value) !== id));
}

export function clearRecent(): void {
  // Keep pins; drop everything else.
  commit(entities.filter((e) => e.pinned));
}
