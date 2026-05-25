import type { StepDetail, StepDetailResult } from "./types.js";
import {
  UNAVAILABLE_MSG,
  isDebugUnavailable,
  makeDebugRpc,
} from "./debugRpc.js";
import { traceViaAnvilFork } from "./anvilFallback.js";

interface RawDetailResult {
  structLogs?: Array<{
    stack?: string[];
    memory?: string[];
    storage?: Record<string, string>;
  }>;
}

const MAX_DETAIL_STEPS = 500_000;

/**
 * In-process LRU of full heavy traces (stack/memory/storage per step),
 * keyed by tx hash. The struct logger can't return a window — it always
 * traces from step 0 — so we trace the whole tx once, hold the detail
 * arrays in memory, and slice the requested window from there. Bounded to
 * a few entries because each full trace is tens of MB (stack-dominated).
 */
const LRU_MAX = 3;
const lru = new Map<string, StepDetail[]>();

function lruGet(hash: string): StepDetail[] | undefined {
  const v = lru.get(hash);
  if (v) {
    // Refresh recency.
    lru.delete(hash);
    lru.set(hash, v);
  }
  return v;
}

function lruSet(hash: string, detail: StepDetail[]): void {
  lru.set(hash, detail);
  while (lru.size > LRU_MAX) {
    const oldest = lru.keys().next().value;
    if (oldest === undefined) break;
    lru.delete(oldest);
  }
}

async function loadFullDetail(hash: string): Promise<StepDetail[] | null> {
  const config = {
    disableStorage: false,
    disableMemory: false,
    disableStack: false,
    limit: MAX_DETAIL_STEPS,
  };

  const parse = (raw: RawDetailResult): StepDetail[] =>
    (raw.structLogs ?? []).map((s) => ({
      stack: s.stack ?? [],
      memory: s.memory ?? [],
      storage: s.storage ?? {},
    }));

  try {
    const rpcResult = await makeDebugRpc("debug_traceTransaction", [
      hash,
      config,
    ]);
    if (rpcResult.error) {
      if (isDebugUnavailable(rpcResult.error)) {
        const anvilResult = await traceViaAnvilFork(hash, config);
        return anvilResult ? parse(anvilResult.result as RawDetailResult) : null;
      }
      return null;
    }
    return parse(rpcResult.result as RawDetailResult);
  } catch {
    const anvilResult = await traceViaAnvilFork(hash, config);
    return anvilResult ? parse(anvilResult.result as RawDetailResult) : null;
  }
}

/**
 * Return per-step EVM state for the half-open window [from, to). The full
 * heavy trace is loaded once per tx and cached in-process; subsequent
 * windows for the same tx are served from memory.
 */
export async function getOpcodeDetail(
  hash: string,
  from: number,
  to: number,
): Promise<StepDetailResult> {
  let full = lruGet(hash);
  if (!full) {
    const loaded = await loadFullDetail(hash);
    if (!loaded) {
      return { detail: {}, error: UNAVAILABLE_MSG, debugAvailable: false };
    }
    full = loaded;
    lruSet(hash, full);
  }

  const lo = Math.max(0, Math.min(from, full.length));
  const hi = Math.max(lo, Math.min(to, full.length));
  const detail: Record<number, StepDetail> = {};
  for (let i = lo; i < hi; i++) {
    detail[i] = full[i]!;
  }

  return { detail, error: null, debugAvailable: true };
}
