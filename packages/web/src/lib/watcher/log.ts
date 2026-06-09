/**
 * IDB-backed ring buffer of fired watch matches. Persisting the activity (vs.
 * keeping it in React state) means a fired match survives navigation and is the
 * single source both the ambient toast and the per-workspace activity log read
 * from. Capped at `WATCH_LOG_CAP` — this is an ambient feed, not an archive.
 */

import { get, set } from "idb-keyval";
import {
  EMPTY_LOG_STORE,
  WATCH_LOG_CAP,
  type WatchLogStore,
  type WatchMatch,
  type WatchMatchContent,
  type WatchRule,
} from "./types.js";
import { ruleLabel } from "./types.js";

const IDB_KEY = "valvetech-watch-log";

export async function loadMatches(): Promise<WatchMatch[]> {
  const raw = await get<WatchLogStore>(IDB_KEY);
  if (!raw || raw.schemaVersion !== 1) return EMPTY_LOG_STORE.matches;
  return raw.matches;
}

export async function persistMatches(matches: WatchMatch[]): Promise<void> {
  await set(IDB_KEY, { schemaVersion: 1, matches } satisfies WatchLogStore);
}

// -----------------------------------------------------------------------------
// Pure helpers (no IDB).
// -----------------------------------------------------------------------------

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `wm-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/**
 * Identity for dedupe: same rule + same tx + same summary parts + same raw
 * amount is one event. Keys on the structured fields (not a rendered string) so
 * two distinct transfers in one tx — same rule, same tx hash, different parties
 * or amounts — stay distinct.
 */
function matchKey(
  m: Pick<WatchMatch, "ruleId" | "txHash" | "lead" | "trail" | "amount">,
): string {
  return `${m.ruleId}|${m.txHash ?? ""}|${m.lead}|${m.amount?.raw ?? ""}|${m.trail}`;
}

/** Stamp a matcher payload with rule context + identity/time. */
export function toMatch(rule: WatchRule, content: WatchMatchContent): WatchMatch {
  return {
    ...content,
    id: genId(),
    ruleId: rule.id,
    workspaceId: rule.workspaceId,
    chainId: rule.chainId,
    kind: rule.kind,
    label: ruleLabel(rule),
    at: Date.now(),
  };
}

/**
 * Prepend `incoming` to the log, dropping any that duplicate an existing entry
 * (viem can re-emit the same block/log across polls — `emitMissed`, reorgs,
 * filter overlap), then cap. Returns a NEW array; reference-equal to `existing`
 * when nothing new survived dedupe, so callers can skip the IDB write.
 */
export function appendMatches(
  existing: WatchMatch[],
  incoming: WatchMatch[],
): WatchMatch[] {
  const seen = new Set(existing.map(matchKey));
  const fresh = incoming.filter((m) => !seen.has(matchKey(m)));
  if (fresh.length === 0) return existing;
  return [...fresh, ...existing].slice(0, WATCH_LOG_CAP);
}
