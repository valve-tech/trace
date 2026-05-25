/**
 * Recently-debugged transactions — the tx hashes the user has opened in the
 * debugger, most-recent first. Persisted to localStorage and shared via
 * `useRecentDebuggerTxs`, so the debugger landing can offer one-click reopen.
 * Distinct from the general recent-entities store (which spans the whole app);
 * this one is specifically "things I traced".
 */

export interface RecentDebuggerTx {
  hash: string;
  lastSeen: number;
}

const STORAGE_KEY = "debugger.recentTxs";
const MAX = 12;

function load(): RecentDebuggerTx[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is RecentDebuggerTx =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as RecentDebuggerTx).hash === "string" &&
        typeof (v as RecentDebuggerTx).lastSeen === "number",
    );
  } catch {
    return [];
  }
}

let txs: RecentDebuggerTx[] = load();
const listeners = new Set<() => void>();

function commit(next: RecentDebuggerTx[]): void {
  txs = next;
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

export function getSnapshot(): RecentDebuggerTx[] {
  return txs;
}

/** Record (or bump) a debugged tx to the front of the list. */
export function recordDebuggerTx(hash: string): void {
  const h = hash.toLowerCase();
  const rest = txs.filter((t) => t.hash.toLowerCase() !== h);
  commit([{ hash, lastSeen: Date.now() }, ...rest].slice(0, MAX));
}

export function removeDebuggerTx(hash: string): void {
  const h = hash.toLowerCase();
  commit(txs.filter((t) => t.hash.toLowerCase() !== h));
}

export function clearDebuggerTxs(): void {
  commit([]);
}
