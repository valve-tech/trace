import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const IDB_KEY = "pulsedev-query-cache";
const MAX_QUERIES = 1000;

/**
 * IndexedDB persister for TanStack Query.
 * Evicts oldest entries when the cache exceeds MAX_QUERIES.
 */
export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      // Evict oldest queries if over the limit
      if (client.clientState.queries.length > MAX_QUERIES) {
        const sorted = [...client.clientState.queries].sort(
          (a, b) => (a.state.dataUpdatedAt ?? 0) - (b.state.dataUpdatedAt ?? 0),
        );
        client.clientState.queries = sorted.slice(sorted.length - MAX_QUERIES);
      }
      await set(IDB_KEY, client);
    },
    restoreClient: async () => {
      return await get<PersistedClient>(IDB_KEY);
    },
    removeClient: async () => {
      await del(IDB_KEY);
    },
  };
}
