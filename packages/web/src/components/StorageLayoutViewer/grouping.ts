import type { StorageEntry } from "./types";

/**
 * Group storage entries by declaring contract, preserving the order in
 * which contracts first appear in the layout. solc emits inherited-
 * contract entries interleaved with the leaf contract's entries; the
 * viewer renders one section per contract, so we collapse that
 * interleaving here.
 *
 * Iteration order on the returned Map matches first-appearance — Map
 * preserves insertion order, and we insert on first sight.
 */
export function groupByContract(
  entries: readonly StorageEntry[],
): Map<string, StorageEntry[]> {
  const map = new Map<string, StorageEntry[]>();
  for (const entry of entries) {
    const group = map.get(entry.contract) ?? [];
    group.push(entry);
    map.set(entry.contract, group);
  }
  return map;
}
