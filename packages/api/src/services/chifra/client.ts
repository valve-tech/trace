/**
 * Low-level HTTP client for chifra.valve.city.
 *
 * Chifra is TrueBlocks served as a REST API. We hit `/export` and `/list` for
 * address-history queries. Block-range filtering is not exposed as a param on
 * `/export` — we ask for the full token history and slice in `transfers.ts`.
 *
 * The hostname serves multiple chains via `?chain=<name>`. PulseChain is
 * `pulsechain`. Default to that since the rest of the platform is PulseChain
 * (chainId 369).
 */

const CHIFRA_BASE =
  process.env.CHIFRA_BASE_URL || "https://chifra.valve.city";

const DEFAULT_CHAIN = "pulsechain";

/**
 * 30s timeout — chifra cold-cache responses can be slow for high-activity
 * addresses (it walks the trueblocks index). Bounded so a hung request
 * doesn't pin a route handler.
 */
const CHIFRA_TIMEOUT_MS = 30_000;

export interface ChifraEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
  errors?: string[];
}

/**
 * Issue a GET against chifra's REST surface and return the parsed envelope,
 * or `null` on any failure (network error, non-2xx, JSON parse, chifra
 * `errors` array populated). Returning null lets callers fall back to other
 * data sources without try/catch noise at every site.
 *
 * The `errors` envelope check is important: chifra always returns HTTP 200,
 * surfacing failures inside the body. Treating a non-empty `errors` as a
 * failure mirrors that contract.
 */
export async function chifraFetch<T = unknown>(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
): Promise<ChifraEnvelope<T> | null> {
  try {
    const qs = new URLSearchParams();
    if (!("chain" in params)) qs.set("chain", DEFAULT_CHAIN);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      qs.set(k, String(v));
    }
    const url = `${CHIFRA_BASE}${path}?${qs.toString()}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(CHIFRA_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const env = (await res.json()) as ChifraEnvelope<T>;
    if (env.errors && env.errors.length > 0) return null;
    return env;
  } catch {
    return null;
  }
}
