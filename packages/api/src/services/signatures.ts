import { pool } from "./pool.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignatureMatch {
  selector: string;
  textSignature: string;
  sigType: "function" | "event";
}

// ---------------------------------------------------------------------------
// API sources — try Sourcify first, then 4byte.directory
// ---------------------------------------------------------------------------

const SOURCIFY_4BYTE_API = "https://api.4byte.sourcify.dev/api/v1";
const FOURBYTE_API = "https://www.4byte.directory/api/v1";

async function fetchFromSource(
  baseUrl: string,
  selector: string,
  sigType: "function" | "event",
): Promise<string[]> {
  const endpoint = sigType === "function" ? "signatures" : "event-signatures";
  const url = `${baseUrl}/${endpoint}/?hex_signature=${selector}&ordering=created_at`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      results?: Array<{ text_signature: string }>;
    };

    return (data.results ?? []).map((r) => r.text_signature);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Cache layer
// ---------------------------------------------------------------------------

async function getCached(selector: string): Promise<SignatureMatch[]> {
  const { rows } = await pool.query<{
    selector: string;
    sig_type: string;
    text_signature: string;
  }>(
    "SELECT selector, sig_type, text_signature FROM signature_cache WHERE selector = $1",
    [selector.toLowerCase()],
  );

  return rows.map((r) => ({
    selector: r.selector,
    textSignature: r.text_signature,
    sigType: r.sig_type as "function" | "event",
  }));
}

async function cacheSignatures(
  selector: string,
  sigType: "function" | "event",
  signatures: string[],
): Promise<void> {
  for (const sig of signatures) {
    await pool.query(
      `INSERT INTO signature_cache (selector, sig_type, text_signature)
       VALUES ($1, $2, $3)
       ON CONFLICT (selector, text_signature) DO NOTHING`,
      [selector.toLowerCase(), sigType, sig],
    ).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Negative cache for selectors with no matches (TTL: 1 hour)
const SIG_NOT_FOUND = new Map<string, number>();
const SIG_NOT_FOUND_TTL = 60 * 60 * 1000;

/**
 * Look up function/event signatures by their 4-byte selector.
 * Checks cache first, then tries Sourcify and 4byte.directory APIs.
 */
export async function lookupSelector(
  selector: string,
  sigType: "function" | "event" = "function",
): Promise<SignatureMatch[]> {
  const normalized = selector.toLowerCase().startsWith("0x")
    ? selector.toLowerCase()
    : `0x${selector.toLowerCase()}`;

  // Check negative cache
  const notFoundAt = SIG_NOT_FOUND.get(normalized);
  if (notFoundAt && Date.now() - notFoundAt < SIG_NOT_FOUND_TTL) {
    return [];
  }

  // Check DB cache
  const cached = await getCached(normalized);
  if (cached.length > 0) return cached;

  // Try Sourcify first (faster, more complete)
  let signatures = await fetchFromSource(SOURCIFY_4BYTE_API, normalized, sigType);

  // Fallback to 4byte.directory
  if (signatures.length === 0) {
    signatures = await fetchFromSource(FOURBYTE_API, normalized, sigType);
  }

  if (signatures.length > 0) {
    await cacheSignatures(normalized, sigType, signatures);
    SIG_NOT_FOUND.delete(normalized);
  } else {
    SIG_NOT_FOUND.set(normalized, Date.now());
  }

  return signatures.map((sig) => ({
    selector: normalized,
    textSignature: sig,
    sigType,
  }));
}

/**
 * Batch lookup — resolves multiple selectors in parallel.
 * Useful for decoding an entire trace at once.
 */
export async function lookupSelectors(
  selectors: string[],
): Promise<Record<string, SignatureMatch[]>> {
  const unique = [...new Set(selectors.map((s) => s.toLowerCase().slice(0, 10)))];
  const results: Record<string, SignatureMatch[]> = {};

  // Batch cache lookup
  if (unique.length > 0) {
    const placeholders = unique.map((_, i) => `$${i + 1}`).join(",");
    const { rows } = await pool.query<{
      selector: string;
      sig_type: string;
      text_signature: string;
    }>(
      `SELECT selector, sig_type, text_signature FROM signature_cache WHERE selector IN (${placeholders})`,
      unique,
    );

    for (const r of rows) {
      const key = r.selector;
      if (!results[key]) results[key] = [];
      results[key].push({
        selector: r.selector,
        textSignature: r.text_signature,
        sigType: r.sig_type as "function" | "event",
      });
    }
  }

  // Fetch missing selectors from APIs (in parallel, max 10 concurrent)
  const missing = unique.filter((s) => !results[s]);
  const BATCH_SIZE = 10;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const fetched = await Promise.all(
      batch.map(async (sel) => {
        const matches = await lookupSelector(sel);
        return { selector: sel, matches };
      }),
    );

    for (const { selector, matches } of fetched) {
      results[selector] = matches;
    }
  }

  return results;
}
