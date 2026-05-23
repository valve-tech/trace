/**
 * Loads a token's recent Transfer logs by block-range batches, fronted by the
 * IndexedDB batch cache. Fetches only the grid cells not already cached;
 * filtering and bucketing happen client-side on the returned raw records.
 *
 * The batch containing the current head is "unsealed" — new blocks land in it
 * constantly — so it's always fetched fresh and never cached. Fully-elapsed
 * batches are sealed and cached forever.
 *
 * "Load more" extends the window further back in time; already-cached cells
 * are reused, so each extension only fetches the newly-exposed older batches.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchTransferLogs,
  getHeadBlock,
  type TransferRecord,
} from "../lib/transferLogs";
import {
  getCachedBatches,
  putBatch,
  batchesCovering,
  BATCH_SIZE,
} from "../lib/chartCache";

/** PulseChain ≈ 10s/block. */
const BLOCKS_PER_DAY = 8640;
const DEFAULT_DAYS = 3;
const LOAD_MORE_DAYS = 4;
/** Concurrent in-flight getLogs batches. */
const CONCURRENCY = 5;

export type LoadStatus = "loading" | "success" | "error";

export interface UseTokenTransfers {
  records: TransferRecord[];
  status: LoadStatus;
  error: string | null;
  /** Inclusive block window the records cover. */
  fromBlock: number | null;
  headBlock: number | null;
  /** Days of history currently loaded. */
  days: number;
  loadingMore: boolean;
  loadMore: () => void;
}

/** Run async tasks with a bounded concurrency pool, preserving order. */
async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function useTokenTransfers(token: string): UseTokenTransfers {
  const [records, setRecords] = useState<TransferRecord[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [fromBlock, setFromBlock] = useState<number | null>(null);
  const [headBlock, setHead] = useState<number | null>(null);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [loadingMore, setLoadingMore] = useState(false);

  // Guards against a stale token's fetch resolving over a newer one.
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const load = useCallback(
    async (windowDays: number, isMore: boolean) => {
      const tok = token;
      if (isMore) setLoadingMore(true);
      else setStatus("loading");
      setError(null);

      try {
        const head = await getHeadBlock();
        const from = Math.max(0, head - windowDays * BLOCKS_PER_DAY);
        const starts = batchesCovering(from, head);
        const headBatchStart = starts[starts.length - 1];

        // Sealed batches (fully elapsed) are cacheable; the head batch isn't.
        const cached = await getCachedBatches(tok, starts);

        const merged = await pool(starts, CONCURRENCY, async (s) => {
          const sealed = s + BATCH_SIZE <= head;
          if (sealed && cached.has(s)) return cached.get(s)!;
          const to = Math.min(s + BATCH_SIZE - 1, head);
          const logs = await fetchTransferLogs(tok, s, to);
          if (sealed) void putBatch(tok, s, logs);
          return logs;
        });

        if (tokenRef.current !== tok) return; // token switched mid-flight

        const all = merged.flat();
        setRecords(all);
        setFromBlock(from);
        setHead(head);
        setDays(windowDays);
        setStatus("success");
        void headBatchStart; // (kept for readability of the seal boundary)
      } catch (err) {
        if (tokenRef.current !== tok) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to load logs");
      } finally {
        if (isMore) setLoadingMore(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load(DEFAULT_DAYS, false);
  }, [load]);

  const loadMore = useCallback(() => {
    void load(days + LOAD_MORE_DAYS, true);
  }, [days, load]);

  return {
    records,
    status,
    error,
    fromBlock,
    headBlock,
    days,
    loadingMore,
    loadMore,
  };
}
