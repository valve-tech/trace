import { get, set } from "idb-keyval";

/**
 * Per-address debounce watermark for `WorkspaceSyncAutoPush`.
 *
 * Persists "the most recent workspace.updatedAt we observed and scheduled a
 * push for" across tab reloads. Without this, every fresh tab re-schedules a
 * push for the most-recent local edit — `useWorkspaceSync.pushIfDirty` then
 * short-circuits via its own server-side cursor, but the IDB read + state
 * churn is wasted work.
 *
 * Address-scoped because two different wallets may have unrelated workspace
 * histories. A global watermark would let user A's high value suppress
 * user B's first push after a wallet switch.
 */

const IDB_KEY = "valvetech-workspace-sync-watermark";

type Map = Record<string, number>;

function normAddress(address: string): string {
  return address.toLowerCase();
}

export async function loadWatermark(address: string): Promise<number> {
  const map = (await get<Map>(IDB_KEY)) ?? {};
  return map[normAddress(address)] ?? 0;
}

export async function saveWatermark(address: string, value: number): Promise<void> {
  const map = (await get<Map>(IDB_KEY)) ?? {};
  map[normAddress(address)] = value;
  await set(IDB_KEY, map);
}

/**
 * Test helper — drop the whole watermark map. Not part of the runtime API.
 */
export async function _clearWatermarksForTests(): Promise<void> {
  await set(IDB_KEY, {});
}
