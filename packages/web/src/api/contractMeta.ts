import { toFunctionSelector, toEventSelector, type AbiFunction, type AbiEvent } from "viem";

/**
 * Per-contract metadata derived from a single /api/source fetch: the verified
 * contract name and a selector → function-name map built from its ABI.
 *
 * Both are needed to label the call tree (contract name + function name), and
 * fetching the source once per address — rather than once for names and again
 * for ABIs — halves the request load that was tripping backend 500s.
 */

export interface ContractMeta {
  name: string | null;
  /** selector (0x + 8 hex, lowercase) → function name */
  selectors: Record<string, string>;
  /** topic0 (0x + 64 hex, lowercase) → event signature, e.g.
   *  `Transfer(address,address,uint256)`. Lets the debugger label emitted
   *  events from the verified ABI without a 4byte round-trip. */
  events: Record<string, string>;
}

const cache = new Map<string, ContractMeta>();

/**
 * Exponential-ish backoff for retrying transient upstream failures.
 * Three attempts total, worst case ~2.2s before we give up on an address.
 * Exported so tests can override with `vi.useFakeTimers()` + length-asserts.
 */
export const RETRY_BACKOFF_MS = [200, 500, 1500];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exported for unit tests; also safe for callers that already hold a parsed ABI.
export function buildSelectorMap(abi: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(abi)) return map;
  for (const item of abi) {
    if (!item || (item as { type?: string }).type !== "function") continue;
    try {
      map[toFunctionSelector(item as AbiFunction).toLowerCase()] = (
        item as AbiFunction
      ).name;
    } catch {
      // Skip malformed ABI entries.
    }
  }
  return map;
}

// Exported for unit tests; also safe for callers that already hold a parsed ABI.
export function buildEventMap(abi: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(abi)) return map;
  for (const item of abi) {
    const ev = item as AbiEvent;
    if (!item || ev.type !== "event") continue;
    try {
      const topic0 = toEventSelector(ev).toLowerCase();
      const params = (ev.inputs ?? []).map((i) => i.type).join(",");
      map[topic0] = `${ev.name}(${params})`;
    } catch {
      // Skip malformed ABI entries.
    }
  }
  return map;
}

/**
 * Single-attempt fetch + envelope parse. Distinguishes three outcomes:
 *
 *   - `{ kind: "ok", meta }`         definitive — verified-meta OR
 *                                    confirmed-unverified. Safe to cache.
 *   - `{ kind: "transient", reason }`  upstream is flaky (Blockscout 5xx,
 *                                    Sourcify network error, our own
 *                                    HTTP 5xx, our `temporarily
 *                                    unavailable` envelope-error string,
 *                                    fetch throw). Caller retries.
 *   - `{ kind: "fatal", reason }`     non-retryable envelope error
 *                                    (malformed address, schema mismatch).
 *                                    Caller stops retrying and omits.
 */
type FetchOutcome =
  | { kind: "ok"; meta: ContractMeta }
  | { kind: "transient"; reason: string }
  | { kind: "fatal"; reason: string };

async function attemptFetchMeta(addr: string): Promise<FetchOutcome> {
  // Etherscan-shaped surface — `module=contract&action=getsourcecode`
  // returns an array of one record; `ABI === "Contract source code not
  // verified"` signals the genuine-unverified case (a definitive answer).
  // We use this rather than `/api/source/:addr` directly because the
  // module/action shape is what external tooling (hardhat-verify, foundry)
  // will use, and exercising it from the in-app call tree gives us
  // coverage of the same code path.
  const url = `/api?module=contract&action=getsourcecode&address=${addr}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  } catch (err) {
    return {
      kind: "transient",
      reason: err instanceof Error ? err.message : "network error",
    };
  }

  if (!res.ok) {
    // 5xx is transient; 4xx is a bug on our side (we already validated the
    // address shape). Treat both as transient out of conservatism — a 4xx
    // typically resolves to "give up" after the retry budget anyway.
    return { kind: "transient", reason: `HTTP ${res.status}` };
  }

  const data = (await res.json().catch(() => null)) as {
    status?: string;
    result?: Array<{ ContractName?: string; ABI?: string }> | string;
  } | null;

  if (!data) return { kind: "fatal", reason: "malformed JSON" };

  if (data.status !== "1") {
    const errMessage =
      typeof data.result === "string"
        ? data.result
        : "Etherscan envelope error";
    if (/temporarily unavailable/i.test(errMessage)) {
      return { kind: "transient", reason: errMessage };
    }
    return { kind: "fatal", reason: errMessage };
  }

  const records = Array.isArray(data.result) ? data.result : [];
  const record = records[0];
  const name = record?.ContractName ? record.ContractName : null;
  let abi: unknown = [];
  if (record?.ABI && record.ABI !== "Contract source code not verified") {
    try {
      abi = JSON.parse(record.ABI);
    } catch {
      // Malformed ABI string — fall through with no selectors. The
      // address is still "confirmed verified" per the envelope; we
      // just can't decode it. Treat as a definitive answer.
    }
  }
  return {
    kind: "ok",
    meta: {
      name,
      selectors: buildSelectorMap(abi),
      events: buildEventMap(abi),
    },
  };
}

/**
 * Resolve meta for one address with bounded retry. Returns the meta when
 * the upstream gave a definitive answer (verified OR confirmed-unverified).
 * Returns null when we couldn't get a definitive answer within
 * `RETRY_BACKOFF_MS.length` attempts — the caller omits the address from
 * the result so the next render reattempts. We never surface a "loaded
 * empty meta" that callers could mistake for a confirmed answer.
 */
async function fetchMetaWithRetry(addr: string): Promise<ContractMeta | null> {
  for (let attempt = 0; attempt < RETRY_BACKOFF_MS.length; attempt += 1) {
    const outcome = await attemptFetchMeta(addr);
    if (outcome.kind === "ok") return outcome.meta;
    if (outcome.kind === "fatal") {
      console.warn(
        `[contractMeta] non-retryable error for ${addr}: ${outcome.reason}`,
      );
      return null;
    }
    // transient — log on the last attempt only so we don't spam the
    // console for momentary flakes.
    if (attempt === RETRY_BACKOFF_MS.length - 1) {
      console.warn(
        `[contractMeta] giving up on ${addr} after ${RETRY_BACKOFF_MS.length} attempts: ${outcome.reason}`,
      );
      return null;
    }
    await sleep(RETRY_BACKOFF_MS[attempt]!);
  }
  return null;
}

export async function resolveContractMeta(
  addresses: string[],
): Promise<Record<string, ContractMeta>> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const result: Record<string, ContractMeta> = {};

  const uncached: string[] = [];
  for (const addr of unique) {
    if (cache.has(addr)) result[addr] = cache.get(addr)!;
    else uncached.push(addr);
  }

  // Modest concurrency — the upstream verification source may recompile,
  // so flooding the endpoint 500s.
  const BATCH = 4;
  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH);
    const fetched = await Promise.all(
      batch.map(
        async (addr): Promise<[string, ContractMeta | null]> => [
          addr,
          await fetchMetaWithRetry(addr),
        ],
      ),
    );

    for (const [addr, meta] of fetched) {
      // Definitive answers (verified or confirmed-unverified) are cached
      // and included in the result. Indefinite answers (null) are
      // *omitted* from both — the caller's `result[addr] ?? fallback`
      // path keeps rendering the truncated address, and the next call
      // refetches automatically because `cache.has(addr)` stays false.
      if (meta !== null) {
        cache.set(addr, meta);
        result[addr] = meta;
      }
    }
  }

  return result;
}
