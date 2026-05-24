import { useSyncExternalStore } from "react";
import { getSnapshot, subscribe, type TrackedTx } from "../lib/trackedTxs";

/** Reactive view of the tracked-transaction store. */
export function useTrackedTxs(): TrackedTx[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
