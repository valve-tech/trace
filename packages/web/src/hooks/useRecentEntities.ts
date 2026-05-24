import { useSyncExternalStore } from "react";
import {
  getSnapshot,
  subscribe,
  type RecentEntity,
} from "../lib/recentEntities";

/**
 * Reactive view of the recent/pinned entity store. Re-renders the consumer
 * whenever an entity is visited, pinned, or evicted — in any component.
 */
export function useRecentEntities(): RecentEntity[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
