import type { PendingTx } from "../../../api/mempool";
import { bigintOf } from "./formatters";

/**
 * Sort/filter primitives extracted from MempoolView. Pure — no React, no
 * fetch — so the (search + type-filter + sort) pipeline can be tested as
 * one unit without mounting the table.
 */

export type SortKey = "rank" | "tip" | "cap" | "nonce";

/**
 * Comparator for a chosen sort key. "rank" is a no-op so the table
 * preserves the node's effective-priority-tip order, which is what the
 * RPC already sorts by.
 */
export function compareTx(a: PendingTx, b: PendingTx, key: SortKey): number {
  switch (key) {
    case "tip":
      return Number(
        bigintOf(b.maxPriorityFeePerGas ?? b.gasPrice) -
          bigintOf(a.maxPriorityFeePerGas ?? a.gasPrice),
      );
    case "cap":
      return Number(
        bigintOf(b.maxFeePerGas ?? b.gasPrice) -
          bigintOf(a.maxFeePerGas ?? a.gasPrice),
      );
    case "nonce":
      return a.nonce - b.nonce;
    case "rank":
      return 0;
  }
}

/**
 * Distinct tx-types present in a batch, sorted alphabetically. Drives
 * which filter chips appear in the toolbar — chips for types that
 * don't exist in the current snapshot are useless and noisy.
 */
export function distinctTypes(txs: readonly PendingTx[]): string[] {
  const set = new Set<string>();
  for (const tx of txs) set.add(tx.type);
  return [...set].sort();
}

/**
 * Apply the search query, type filter, and sort key to a snapshot of
 * pending txs. Pure: same inputs → same outputs, no mutation of the
 * input array (always returns a fresh array when sorting).
 *
 * Search matches by case-insensitive substring on `hash` or `from`.
 * An empty `typeFilter` set means "all types pass" (not "no types
 * pass") — matches the toolbar's "no chips selected = unfiltered" UX.
 */
export function filterAndSortPending(
  txs: readonly PendingTx[],
  opts: {
    search: string;
    typeFilter: ReadonlySet<string>;
    sortKey: SortKey;
  },
): PendingTx[] {
  let rows: readonly PendingTx[] = txs;
  const q = opts.search.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (tx) =>
        tx.hash.toLowerCase().includes(q) ||
        tx.from.toLowerCase().includes(q),
    );
  }
  if (opts.typeFilter.size > 0) {
    rows = rows.filter((tx) => opts.typeFilter.has(tx.type));
  }
  if (opts.sortKey !== "rank") {
    return [...rows].sort((a, b) => compareTx(a, b, opts.sortKey));
  }
  return rows.slice();
}
