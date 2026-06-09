/**
 * IDB-backed store for watch rules — a companion blob to the Workspace store
 * (`valvetech-workspaces`), kept separate so the Workspace schema stays frozen
 * and the watcher engine can load every rule across all workspaces in one read.
 *
 * Same shape as `workspace/store.ts`: a single JSON blob under one key, with
 * pure CRUD helpers (no IDB) that the `useWatchRules` hook composes. Rules are
 * few (a handful per workspace), so load-all / write-all is fine.
 */

import { get, set } from "idb-keyval";
import {
  EMPTY_RULE_STORE,
  type WatchRule,
  type WatchRuleKind,
  type WatchRuleStore,
} from "./types.js";

const IDB_KEY = "valvetech-watch-rules";

export async function loadRules(): Promise<WatchRule[]> {
  const raw = await get<WatchRuleStore>(IDB_KEY);
  if (!raw || raw.schemaVersion !== 1) return EMPTY_RULE_STORE.rules;
  return raw.rules;
}

export async function persistRules(rules: WatchRule[]): Promise<void> {
  await set(IDB_KEY, { schemaVersion: 1, rules } satisfies WatchRuleStore);
}

// -----------------------------------------------------------------------------
// Pure helpers (no IDB).
// -----------------------------------------------------------------------------

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `wr-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/** Lower-case 0x-hex; pass through empty/undefined as undefined. */
function normAddr(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v.toLowerCase() : undefined;
}

export interface NewRuleInput {
  workspaceId: string;
  chainId: number;
  kind: WatchRuleKind;
  label?: string;
  address?: string;
  direction?: WatchRule["direction"];
  /** Minimum native value in wei (decimal string); "" / "0" → no threshold. */
  minValueWei?: string;
  contractAddress?: string;
  counterparty?: string;
}

/** Treat "", "0", and undefined alike — all mean "no threshold". */
function normThreshold(value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v || v === "0") return undefined;
  return v;
}

/**
 * Build a rule from form input, normalizing addresses and dropping the fields
 * that don't apply to the chosen kind (so an `address_activity` rule never
 * carries a stray `contractAddress`, keeping the subscription signature clean).
 */
export function buildRule(input: NewRuleInput): WatchRule {
  const base: WatchRule = {
    id: genId(),
    workspaceId: input.workspaceId,
    chainId: input.chainId,
    kind: input.kind,
    enabled: true,
    label: input.label?.trim() || undefined,
    createdAt: Date.now(),
  };
  if (input.kind === "address_activity") {
    return {
      ...base,
      address: normAddr(input.address),
      direction: input.direction ?? "both",
      minValueWei: normThreshold(input.minValueWei),
    };
  }
  return {
    ...base,
    contractAddress: normAddr(input.contractAddress),
    counterparty: normAddr(input.counterparty),
  };
}

export function toggleRule(rules: WatchRule[], id: string): WatchRule[] {
  return rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
}

/**
 * Flip every rule in one workspace to `enabled` — the pause-all / resume-all
 * bulk action. Rules in other workspaces are untouched, so the engine only
 * reconciles the subscriptions whose signature actually changed.
 */
export function setEnabledForWorkspace(
  rules: WatchRule[],
  workspaceId: string,
  enabled: boolean,
): WatchRule[] {
  return rules.map((r) =>
    r.workspaceId === workspaceId ? { ...r, enabled } : r,
  );
}

export function removeRule(rules: WatchRule[], id: string): WatchRule[] {
  return rules.filter((r) => r.id !== id);
}

/** True when a rule has the minimum conditions to actually subscribe. */
export function isRuleActionable(rule: WatchRule): boolean {
  if (rule.kind === "address_activity") return Boolean(rule.address);
  return Boolean(rule.contractAddress);
}
