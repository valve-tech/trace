/**
 * Address appearance index via chifra (`/list`). An appearance is a
 * (blockNumber, transactionIndex) pair for every tx an address shows up
 * in — the cheap index read (seconds, even cold) as opposed to the
 * heavyweight log walks in transfers.ts. Callers hydrate the pairs into
 * full transactions through our own RPC.
 *
 * Results cache briefly (30s) per (chain, address, page) — long enough to
 * absorb a UI's refetch bursts, short enough that a new tx shows up on the
 * next page load.
 */

import { currentChain } from "../chains/context.js";

const CHIFRA_BASE = process.env.CHIFRA_BASE_URL || "https://chifra.valve.city";
const CHIFRA_TIMEOUT_MS = 30_000;

const APPEARANCE_TTL_MS = 30_000;
const appearanceCache = new Map<
  string,
  { value: Appearance[]; t: number }
>();

export interface Appearance {
  blockNumber: number;
  transactionIndex: number;
}

interface ChifraListResponse {
  data?: Array<{
    address: string;
    blockNumber: number;
    transactionIndex: number;
  }>;
  errors?: string[];
}

/**
 * Latest-first appearances for an address, paged. Returns `[]` for an
 * address chifra has never seen (and on chifra outage — address history
 * is a degradable feature, not a request-fatal one).
 */
export async function listAppearances(
  address: string,
  page: number = 1,
  limit: number = 25,
): Promise<Appearance[]> {
  const chain = currentChain().chifraChain;
  const cacheKey = `${chain}:${address.toLowerCase()}:${page}:${limit}`;
  const cached = appearanceCache.get(cacheKey);
  if (cached && Date.now() - cached.t < APPEARANCE_TTL_MS) return cached.value;

  const params = new URLSearchParams({
    addrs: address,
    chain,
    reversed: "true",
    // chifra's firstRecord is 0-based (verified against the live daemon).
    firstRecord: String((page - 1) * limit),
    maxRecords: String(limit),
  });

  try {
    const res = await fetch(`${CHIFRA_BASE}/list?${params}`, {
      signal: AbortSignal.timeout(CHIFRA_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as ChifraListResponse;
    if (!Array.isArray(json.data)) return [];
    const appearances = json.data.map((row) => ({
      blockNumber: row.blockNumber,
      transactionIndex: row.transactionIndex,
    }));
    appearanceCache.set(cacheKey, { value: appearances, t: Date.now() });
    if (appearanceCache.size > 500) {
      const oldest = appearanceCache.keys().next().value;
      if (oldest !== undefined) appearanceCache.delete(oldest);
    }
    return appearances;
  } catch {
    return [];
  }
}
