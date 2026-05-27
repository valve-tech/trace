/**
 * Persistence for the debugger call-tree's expand/collapse state.
 *
 * Scoped per (chain, transaction) so the same tx hash on a different chain
 * can't collide, and stamped with `updatedAt` so old entries can be pruned and
 * we never grow localStorage without bound. Only deviations from the depth
 * default are stored, keyed by the stable nodeKey, so the map stays small and
 * untouched branches keep following the default.
 */

// PulseChain is the only network this app targets (see shared/PULSECHAIN_CHAIN_ID).
const DEFAULT_CHAIN_ID = 369;
const PREFIX = "debugger:tree-expand";
// Entries untouched for this long are swept on the next debugger load.
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 60; // 60 days

type Overrides = Record<string, boolean>;
interface Stored {
  updatedAt: number;
  overrides: Overrides;
}

function keyFor(txHash: string, chainId: number): string {
  return `${PREFIX}:${chainId}:${txHash.toLowerCase()}`;
}

/** Load saved overrides for a tx, tolerating the pre-`updatedAt` flat shape. */
export function loadTreeExpandState(
  txHash: string,
  chainId: number = DEFAULT_CHAIN_ID,
): Overrides {
  try {
    const raw = localStorage.getItem(keyFor(txHash, chainId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if ("overrides" in parsed) return (parsed as Stored).overrides ?? {};
      return parsed as Overrides; // legacy flat { nodeKey: bool }
    }
    return {};
  } catch {
    return {};
  }
}

/** Persist overrides for a tx, stamping the current time. */
export function saveTreeExpandState(
  txHash: string,
  overrides: Overrides,
  chainId: number = DEFAULT_CHAIN_ID,
): void {
  try {
    const value: Stored = { updatedAt: Date.now(), overrides };
    localStorage.setItem(keyFor(txHash, chainId), JSON.stringify(value));
  } catch {
    /* quota / disabled storage — the in-memory state still works this session. */
  }
}

/** Remove tree-state entries older than MAX_AGE_MS. Safe to call on every load. */
export function pruneStaleTreeState(now: number = Date.now()): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(`${PREFIX}:`)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(k) ?? "") as Partial<Stored>;
        if (typeof parsed.updatedAt === "number" && now - parsed.updatedAt > MAX_AGE_MS) {
          stale.push(k);
        }
      } catch {
        /* leave unparseable / legacy entries alone */
      }
    }
    for (const k of stale) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}
