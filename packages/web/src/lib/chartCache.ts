/**
 * Dedicated IndexedDB cache for token Transfer logs, stored in grid-aligned
 * block batches so windows share cells and "load more" only fetches what's
 * missing.
 *
 * Separate from the TanStack Query persister (valvetech-query-cache) on
 * purpose — see docs/CHARTING.md §2: chart payloads are large, need
 * byte-budget eviction (not query-count), and shouldn't share a corruption
 * blast radius with the rest of the query cache.
 *
 * A batch covers a fixed [batchStart, batchStart + BATCH_SIZE) block range
 * aligned to BATCH_SIZE. Two overlapping time windows for the same token
 * reuse the cells they share; nothing is fetched twice.
 */

import type { TransferRecord } from "./transferLogs";

const DB_NAME = "valvetech-chart-cache";
const DB_VERSION = 2; // bumped from v1 (was window-keyed transfer windows)
const STORE = "logBatches";

/** Block batch size. Caps per-request log count and is the cache grain. */
export const BATCH_SIZE = 2000;

export interface LogBatch {
  key: string; // `${token}:${batchStart}`
  token: string;
  batchStart: number;
  logs: TransferRecord[];
  sizeBytes: number;
  cachedAt: number;
  lastAccessed: number;
}

export function batchStartFor(block: number): number {
  return Math.floor(block / BATCH_SIZE) * BATCH_SIZE;
}

/** The grid-aligned batch starts covering [fromBlock, toBlock] inclusive. */
export function batchesCovering(fromBlock: number, toBlock: number): number[] {
  const starts: number[] = [];
  for (
    let s = batchStartFor(fromBlock);
    s <= toBlock;
    s += BATCH_SIZE
  ) {
    starts.push(s);
  }
  return starts;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Drop any prior-version store; the v1 shape (window-keyed) is gone.
      if (db.objectStoreNames.contains("transfers")) {
        db.deleteObjectStore("transfers");
      }
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("byToken", "token");
        store.createIndex("byLastAccessed", "lastAccessed");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function store(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function keyFor(token: string, batchStart: number): string {
  return `${token.toLowerCase()}:${batchStart}`;
}

/**
 * Read cached batches for the given starts. Returns a map of batchStart →
 * logs for cells that are present; absent cells are simply missing from the
 * map. Bumps lastAccessed on hits (fire-and-forget). Never throws — the
 * cache is an optimization.
 */
export async function getCachedBatches(
  token: string,
  starts: number[],
): Promise<Map<number, TransferRecord[]>> {
  const out = new Map<number, TransferRecord[]>();
  try {
    const db = await openDB();
    const now = Date.now();
    await Promise.all(
      starts.map(async (s) => {
        const entry = (await promisify(
          store(db, "readonly").get(keyFor(token, s)),
        )) as LogBatch | undefined;
        if (entry) {
          out.set(s, entry.logs);
          entry.lastAccessed = now;
          void promisify(store(db, "readwrite").put(entry)).catch(() => {});
        }
      }),
    );
  } catch {
    // miss-all on error
  }
  return out;
}

/** Persist one batch, then enforce the quota budget. Best-effort. */
export async function putBatch(
  token: string,
  batchStart: number,
  logs: TransferRecord[],
): Promise<void> {
  try {
    const db = await openDB();
    const now = Date.now();
    const entry: LogBatch = {
      key: keyFor(token, batchStart),
      token: token.toLowerCase(),
      batchStart,
      logs,
      sizeBytes: JSON.stringify(logs).length,
      cachedAt: now,
      lastAccessed: now,
    };
    await promisify(store(db, "readwrite").put(entry));
    await enforceQuota(db);
  } catch {
    // optimization only
  }
}

/**
 * Rule 1 from docs/CHARTING.md §5 — when usage exceeds 80% of reported quota,
 * evict least-recently-accessed batches down to 60%. The 60% target leaves
 * headroom so we don't oscillate at the wall.
 */
async function enforceQuota(db: IDBDatabase): Promise<void> {
  if (!navigator.storage?.estimate) return;
  const { quota = 0, usage = 0 } = await navigator.storage.estimate();
  if (quota === 0 || usage <= quota * 0.8) return;

  const target = quota * 0.6;
  let freed = usage;
  await new Promise<void>((resolve) => {
    const cursorReq = store(db, "readwrite")
      .index("byLastAccessed")
      .openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor || freed <= target) {
        resolve();
        return;
      }
      freed -= (cursor.value as LogBatch).sizeBytes;
      cursor.delete();
      cursor.continue();
    };
    cursorReq.onerror = () => resolve();
  });
}

/** Drop every cached batch for one token (debug / manual refresh). */
export async function evictToken(token: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const cursorReq = store(db, "readwrite")
        .index("byToken")
        .openCursor(IDBKeyRange.only(token.toLowerCase()));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          resolve();
          return;
        }
        cursor.delete();
        cursor.continue();
      };
      cursorReq.onerror = () => resolve();
    });
  } catch {
    // best-effort
  }
}
