/**
 * Tracked-transaction store. The user pins a tx (usually from the mempool) and
 * we watch its lifecycle: pending → mined (success/reverted) or dropped. The
 * elapsed timer freezes at resolution, so you can see how long it took.
 *
 * Persisted to localStorage and shared via `useTrackedTxs` (useSyncExternal-
 * Store). Status resolution itself lives in the UI layer (it needs the live
 * mempool + a tx lookup); this store just holds the record and freezes timing.
 */

export type TrackStatus = "pending" | "mined" | "dropped";

export interface TrackedTx {
  hash: string;
  /** When the user pinned it — the clock starts here. */
  firstSeen: number;
  status: TrackStatus;
  /** When status left "pending"; freezes the elapsed display. */
  resolvedAt?: number;
  blockNumber?: string;
  execStatus?: "success" | "reverted";
}

const STORAGE_KEY = "explorer.trackedTxs";

function load(): TrackedTx[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTrackedTx);
  } catch {
    return [];
  }
}

function isTrackedTx(v: unknown): v is TrackedTx {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.hash === "string" &&
    typeof t.firstSeen === "number" &&
    (t.status === "pending" || t.status === "mined" || t.status === "dropped")
  );
}

let txs: TrackedTx[] = load();
const listeners = new Set<() => void>();

function commit(next: TrackedTx[]): void {
  // Newest pin first.
  txs = [...next].sort((a, b) => b.firstSeen - a.firstSeen);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
  } catch {
    /* best-effort */
  }
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): TrackedTx[] {
  return txs;
}

export function isTracked(hash: string): boolean {
  const h = hash.toLowerCase();
  return txs.some((t) => t.hash.toLowerCase() === h);
}

export function trackTx(hash: string): void {
  const h = hash.toLowerCase();
  if (txs.some((t) => t.hash.toLowerCase() === h)) return;
  commit([
    { hash, firstSeen: Date.now(), status: "pending" },
    ...txs,
  ]);
}

export function untrackTx(hash: string): void {
  const h = hash.toLowerCase();
  commit(txs.filter((t) => t.hash.toLowerCase() !== h));
}

export function toggleTrack(hash: string): void {
  if (isTracked(hash)) untrackTx(hash);
  else trackTx(hash);
}

/**
 * Record a resolution (or status change) for a tracked tx. Idempotent: only
 * commits when something actually changed, and stamps `resolvedAt` the first
 * time the tx leaves "pending" so the elapsed timer freezes.
 */
export function resolveTracked(
  hash: string,
  patch: {
    status: TrackStatus;
    blockNumber?: string;
    execStatus?: "success" | "reverted";
  },
): void {
  const h = hash.toLowerCase();
  const existing = txs.find((t) => t.hash.toLowerCase() === h);
  if (!existing) return;

  const resolvedAt =
    patch.status !== "pending" && existing.resolvedAt === undefined
      ? Date.now()
      : existing.resolvedAt;

  const merged: TrackedTx = {
    ...existing,
    status: patch.status,
    resolvedAt,
    blockNumber: patch.blockNumber ?? existing.blockNumber,
    execStatus: patch.execStatus ?? existing.execStatus,
  };

  if (
    merged.status === existing.status &&
    merged.resolvedAt === existing.resolvedAt &&
    merged.blockNumber === existing.blockNumber &&
    merged.execStatus === existing.execStatus
  ) {
    return;
  }

  commit(txs.map((t) => (t.hash.toLowerCase() === h ? merged : t)));
}

export function clearResolved(): void {
  commit(txs.filter((t) => t.status === "pending"));
}
