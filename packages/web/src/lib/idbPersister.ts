import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const IDB_KEY = "pulsedev-query-cache";

/**
 * IndexedDB persister for TanStack Query.
 * Uses idb-keyval for a simple key-value API backed by IndexedDB.
 * Storage limit: ~60% of disk on Chrome, ~50% on Firefox, 1GB on Safari.
 */
export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
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
