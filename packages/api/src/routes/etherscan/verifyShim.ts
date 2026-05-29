/**
 * GUID lifecycle for Etherscan-compatible verification submissions.
 *
 * Etherscan's verify flow is asynchronous: POST verifysourcecode returns
 * a GUID immediately, and the caller polls GET checkverifystatus?guid=...
 * until the upstream finishes. Sourcify is synchronous — verify returns
 * the match (or rejection) in one round-trip. To preserve tooling
 * compatibility we wrap the synchronous call in an in-memory GUID table:
 * the submit handler resolves Sourcify synchronously, stores the outcome
 * keyed by a fresh GUID, and returns the GUID. checkverifystatus reads
 * the table.
 *
 * The table is process-local. That's fine because:
 *   1. The Sourcify call has already completed before the GUID is handed
 *      out, so a process restart between submit and check is rare — and
 *      Sourcify itself is idempotent, so a re-submit will land on the
 *      same answer.
 *   2. TTL (5 min) is long enough for any reasonable polling cadence
 *      and short enough to bound memory.
 *
 * If we later run multiple API instances behind a load balancer, this
 * table must move to Postgres or Redis — verification status is the
 * only place we currently rely on process-local state surviving across
 * requests from the same client.
 */

import { randomUUID } from "node:crypto";

export type VerifyStatus =
  | { kind: "pass"; match: "perfect" | "partial" }
  | { kind: "fail"; error: string };

interface Entry {
  status: VerifyStatus;
  expiresAt: number;
}

const GUID_TTL_MS = 5 * 60 * 1000;

const table = new Map<string, Entry>();

/** Sweep expired entries. Called lazily on every read/write — no timer. */
function gc(now: number): void {
  for (const [guid, entry] of table) {
    if (entry.expiresAt <= now) table.delete(guid);
  }
}

export function storeVerifyResult(status: VerifyStatus): string {
  const now = Date.now();
  gc(now);
  const guid = randomUUID();
  table.set(guid, { status, expiresAt: now + GUID_TTL_MS });
  return guid;
}

export function lookupVerifyResult(guid: string): VerifyStatus | null {
  const now = Date.now();
  gc(now);
  const entry = table.get(guid);
  if (!entry) return null;
  return entry.status;
}

/** Test-only — drop all entries. */
export function __resetForTesting(): void {
  table.clear();
}
