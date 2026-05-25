import { useSyncExternalStore } from "react";
import {
  getSnapshot,
  subscribe,
  type RecentDebuggerTx,
} from "../lib/recentDebuggerTxs";

/** Reactive view of the recently-debugged transactions store. */
export function useRecentDebuggerTxs(): RecentDebuggerTx[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
