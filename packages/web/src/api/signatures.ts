import { apiUrl } from "../lib/apiBase";
const API_BASE = apiUrl("/api/signatures");

export interface SignatureMatch {
  selector: string;
  textSignature: string;
  sigType: "function" | "event";
}

export async function lookupSignature(selector: string): Promise<SignatureMatch[]> {
  const res = await fetch(`${API_BASE}/${selector}`);
  const data = (await res.json()) as { ok: boolean; matches?: SignatureMatch[] };
  return data.matches ?? [];
}

export async function batchLookupSignatures(
  selectors: string[],
): Promise<Record<string, SignatureMatch[]>> {
  const res = await fetch(`${API_BASE}/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectors }),
  });
  const data = (await res.json()) as { ok: boolean; results?: Record<string, SignatureMatch[]> };
  return data.results ?? {};
}

/**
 * Definitive-vs-transient outcome for a batch signature lookup, paralleling
 * SourceFetchOutcome / SourceMapFetchOutcome. The backend (POST /signatures/batch)
 * returns:
 *   - 200 + ok:true + results  → definitive (cache as-is; backend already
 *     applied its own 1h negative cache for individual misses)
 *   - 5xx                       → transient
 *   - network/timeout            → transient
 *   - 400 / malformed            → fatal
 *
 * On transient, the caller omits the result so the next mount re-asks
 * instead of pinning `{}` under `staleTime: Infinity`. This recovers from
 * the documented "4byte outage → backend 1h negative-cache poisons IDB ∞"
 * failure mode.
 */
type BatchOutcome =
  | { kind: "ok"; results: Record<string, SignatureMatch[]> }
  | { kind: "transient"; reason: string }
  | { kind: "fatal"; reason: string };

const BATCH_TIMEOUT_MS = 8_000;

async function attemptBatchLookup(selectors: string[]): Promise<BatchOutcome> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectors }),
      signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
    });
  } catch (err) {
    return { kind: "transient", reason: err instanceof Error ? err.message : "network error" };
  }
  if (res.status >= 500) return { kind: "transient", reason: `HTTP ${res.status}` };
  if (res.status === 400) return { kind: "fatal", reason: `HTTP 400` };
  if (!res.ok) return { kind: "transient", reason: `HTTP ${res.status}` };
  const data = (await res.json().catch(() => null)) as
    | { ok: boolean; results?: Record<string, SignatureMatch[]>; error?: string }
    | null;
  if (!data) return { kind: "fatal", reason: "malformed JSON" };
  if (!data.ok) {
    // backend signalled error (e.g. signature_cache table down).
    return { kind: "transient", reason: data.error ?? "ok:false" };
  }
  return { kind: "ok", results: data.results ?? {} };
}

const SIG_RETRY_BACKOFF_MS = [400, 1000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Bounded-retry batch lookup. Resolves with `{results}` on a definitive
 * answer or `null` when transient/fatal exhausted the retry budget so the
 * hook can omit the batch from its cached result.
 */
export async function fetchSignaturesBatch(
  selectors: string[],
): Promise<{ results: Record<string, SignatureMatch[]> } | null> {
  for (let attempt = 0; attempt <= SIG_RETRY_BACKOFF_MS.length; attempt += 1) {
    const outcome = await attemptBatchLookup(selectors);
    if (outcome.kind === "ok") return { results: outcome.results };
    if (outcome.kind === "fatal") {
      console.warn(`[signatures] non-retryable error: ${outcome.reason}`);
      return null;
    }
    if (attempt === SIG_RETRY_BACKOFF_MS.length) {
      console.warn(`[signatures] giving up after ${attempt + 1} attempts: ${outcome.reason}`);
      return null;
    }
    await sleep(SIG_RETRY_BACKOFF_MS[attempt]!);
  }
  return null;
}
