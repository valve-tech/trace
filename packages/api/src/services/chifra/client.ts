import {
  createTrueblocksClient,
  type TrueblocksClient,
} from "@valve-tech/trueblocks-sdk";

/**
 * Shared TrueBlocks daemon client + retry helper.
 *
 * The chifra daemon (`CHIFRA_BASE_URL`, default `https://chifra.valve.city`)
 * is chain-agnostic — every verb takes a `chain` query param — so a single
 * client instance serves all chains; callers pass the chain slug from the
 * `ChainConfig` registry (`../chains/registry.ts`).
 *
 * Cold-cache walks (high-history addresses, big tokens) can take 10s+, and
 * the daemon occasionally returns a transient 5xx. The SDK has no built-in
 * timeout, so we inject a 30s AbortSignal per request and retry transient
 * failures once.
 */

export const CHIFRA_BASE =
  process.env.CHIFRA_BASE_URL || "https://chifra.valve.city";

export const CHIFRA_TIMEOUT_MS = 30_000;

export const chifraClient: TrueblocksClient = createTrueblocksClient({
  baseUrl: CHIFRA_BASE,
  fetch: (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(CHIFRA_TIMEOUT_MS) }),
});

/** Retry a chifra call up to `attempts` times on any failure (transient 5xx). */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
