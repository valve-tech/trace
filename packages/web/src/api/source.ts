const API_BASE = "/api/source";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceFile {
  name: string;
  content: string;
}

export interface ContractSource {
  address: string;
  chainSource: string;
  contractName: string | null;
  compilerVersion: string | null;
  optimizationUsed: boolean;
  optimizationRuns: number | null;
  files: SourceFile[];
  abi: unknown[];
  hasSourceMap: boolean;
  hasDeployedBytecode: boolean;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  sourceSnippet: string;
  jumpType: string; // "i" = into function, "o" = out of function, "-" = regular
}

export interface SourceResponse {
  ok: boolean;
  source?: ContractSource;
  error?: string;
  hint?: string;
}

export interface SourceMapResponse {
  ok: boolean;
  mappings?: Record<number, SourceLocation | null>;
  error?: string;
}

export interface SlitherElement {
  type: string;
  name: string;
  sourceMapping?: {
    start: number;
    length: number;
    filename_relative: string;
    lines: number[];
  };
}

export interface SlitherFinding {
  check: string;
  impact: "High" | "Medium" | "Low" | "Informational" | "Optimization";
  confidence: "High" | "Medium" | "Low";
  description: string;
  elements: SlitherElement[];
  markdown?: string;
}

export interface SlitherResult {
  address: string;
  findings: SlitherFinding[];
  detectorCount: number;
  durationMs: number;
  error: string | null;
  analyzedAt: string;
}

export interface SlitherResponse {
  ok: boolean;
  analysis?: SlitherResult;
  warning?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchSource(address: string): Promise<SourceResponse> {
  const res = await fetch(`${API_BASE}/${address}`);
  return (await res.json()) as SourceResponse;
}

/**
 * Definitive-vs-transient outcome for one source fetch. Lets the trace-source
 * batcher distinguish "we asked, contract isn't verified" (cache, with TTL) from
 * "upstream is flaky" (omit, retry) — without that split, an early API hiccup
 * persists empty sources forever under our `staleTime: Infinity` defaults and
 * silently breaks the call-tree fnIndex (no source → no function names → no
 * call-site-override). Mirrors the same pattern proven out in contractMeta.ts.
 */
type SourceFetchOutcome =
  | { kind: "verified"; files: SourceFile[] }
  /** Definitive answer: API says the contract isn't verified (HTTP 404 from
   *  /api/source/:addr, or a 200 with `ok: false` and no transient marker). */
  | { kind: "unverified" }
  /** Upstream is flaky (5xx, network throw, AbortSignal timeout, or the
   *  "temporarily unavailable" envelope hint). Caller retries. */
  | { kind: "transient"; reason: string }
  /** Non-retryable: malformed JSON or other shape error. Caller stops. */
  | { kind: "fatal"; reason: string };

const SOURCE_FETCH_TIMEOUT_MS = 8_000;

async function attemptFetchSource(address: string): Promise<SourceFetchOutcome> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${address}`, {
      signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      kind: "transient",
      reason: err instanceof Error ? err.message : "network error",
    };
  }
  // 404 is the definitive "not verified" signal from routes/source.ts.
  if (res.status === 404) return { kind: "unverified" };
  // Any other HTTP error (5xx, 503 "temporarily unavailable") is transient.
  if (!res.ok) return { kind: "transient", reason: `HTTP ${res.status}` };
  const data = (await res.json().catch(() => null)) as SourceResponse | null;
  if (!data) return { kind: "fatal", reason: "malformed JSON" };
  if (!data.ok) {
    // 200 + ok:false with an explicit "temporarily unavailable" hint flowed
    // through `ApiError` details — treat as transient. Any other ok:false is
    // a definitive answer (treated as not verified).
    if (/temporarily unavailable/i.test(data.error ?? "")) {
      return { kind: "transient", reason: data.error! };
    }
    return { kind: "unverified" };
  }
  return { kind: "verified", files: data.source?.files ?? [] };
}

/**
 * Exponential-ish backoff for transient source fetches. Three attempts, ~3.5s
 * worst case before giving up on one address. Exported so tests can override.
 */
export const SOURCE_RETRY_BACKOFF_MS = [500, 1000, 2000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single-address source fetch with bounded retry. Returns a definitive answer
 * (verified files OR confirmed-unverified) when the upstream gives one within
 * the retry budget; `null` when transient/fatal failures exhausted the budget,
 * so the caller can omit the address from a sparse result and refetch on the
 * next mount instead of pinning the empty answer.
 */
export async function fetchTraceSourceFiles(
  address: string,
): Promise<{ files: SourceFile[]; verified: boolean } | null> {
  for (let attempt = 0; attempt < SOURCE_RETRY_BACKOFF_MS.length; attempt += 1) {
    const outcome = await attemptFetchSource(address);
    if (outcome.kind === "verified") {
      return { files: outcome.files, verified: true };
    }
    if (outcome.kind === "unverified") {
      return { files: [], verified: false };
    }
    if (outcome.kind === "fatal") {
      console.warn(
        `[traceSources] non-retryable error for ${address}: ${outcome.reason}`,
      );
      return null;
    }
    // transient — log on the last attempt only so we don't spam the console.
    if (attempt === SOURCE_RETRY_BACKOFF_MS.length - 1) {
      console.warn(
        `[traceSources] giving up on ${address} after ${SOURCE_RETRY_BACKOFF_MS.length} attempts: ${outcome.reason}`,
      );
      return null;
    }
    await sleep(SOURCE_RETRY_BACKOFF_MS[attempt]!);
  }
  return null;
}

export async function analyzeContract(
  address: string,
  options: { skipCache?: boolean } = {},
): Promise<SlitherResponse> {
  const res = await fetch(`${API_BASE}/${address}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  return (await res.json()) as SlitherResponse;
}

export async function fetchSourceMappings(
  address: string,
  pcs: number[],
): Promise<SourceMapResponse> {
  const res = await fetch(`${API_BASE}/${address}/map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pcs }),
  });
  return (await res.json()) as SourceMapResponse;
}
