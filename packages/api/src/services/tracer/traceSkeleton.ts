import type { SkeletonStep, SkeletonTraceResult } from "./types.js";
import { getCachedTrace, setCachedTrace } from "./cache.js";
import {
  UNAVAILABLE_MSG,
  isDebugUnavailable,
  makeDebugRpc,
} from "./debugRpc.js";
import { traceViaAnvilFork } from "./anvilFallback.js";

interface RawSkeletonResult {
  structLogs?: Array<{
    pc: number;
    op: string;
    gas: number;
    gasCost: number;
    depth: number;
  }>;
  gas?: number;
  returnValue?: string;
}

/**
 * Safety ceiling on skeleton length. Real swaps run ~100k+ steps; this is
 * high enough that realistic txs are never truncated (which is what breaks
 * call-tree navigation), but bounds pathological loops.
 */
const MAX_SKELETON_STEPS = 500_000;

/**
 * Trace a transaction at the opcode level with stack, memory, and storage
 * DISABLED. The struct logger then emits only navigation-relevant fields,
 * so the full execution fits in a fraction of the payload — the stack alone
 * is ~70% of a full struct-log response. Per-step state is loaded lazily
 * (see getOpcodeDetail) for whichever step the user is inspecting.
 *
 * Cached separately from the heavy trace under the `skeleton` trace type.
 */
export async function traceOpcodesSkeleton(
  hash: string,
): Promise<SkeletonTraceResult> {
  const cacheKey = "skeleton";
  const cached = await getCachedTrace<SkeletonTraceResult>(hash, cacheKey);
  if (cached) {
    return { ...cached, debugAvailable: true };
  }

  const config = {
    disableStorage: true,
    disableMemory: true,
    disableStack: true,
    limit: MAX_SKELETON_STEPS,
  };

  const parse = (raw: RawSkeletonResult): SkeletonTraceResult => {
    const steps: SkeletonStep[] = (raw.structLogs ?? []).map((s) => ({
      pc: s.pc,
      op: s.op,
      gas: s.gas,
      gasCost: s.gasCost,
      depth: s.depth,
    }));
    return {
      steps,
      gas: raw.gas ?? 0,
      returnValue: raw.returnValue ?? "",
      error: null,
      debugAvailable: true,
    };
  };

  const unavailable: SkeletonTraceResult = {
    steps: [],
    gas: 0,
    returnValue: "",
    error: UNAVAILABLE_MSG,
    debugAvailable: false,
  };

  try {
    const rpcResult = await makeDebugRpc("debug_traceTransaction", [
      hash,
      config,
    ]);

    if (rpcResult.error) {
      if (isDebugUnavailable(rpcResult.error)) {
        const anvilResult = await traceViaAnvilFork(hash, config);
        if (anvilResult) {
          const result = parse(anvilResult.result as RawSkeletonResult);
          void setCachedTrace(hash, cacheKey, result);
          return result;
        }
        return unavailable;
      }
      return {
        ...unavailable,
        error: `RPC error: ${rpcResult.error.message}`,
        debugAvailable: true,
      };
    }

    const result = parse(rpcResult.result as RawSkeletonResult);
    void setCachedTrace(hash, cacheKey, result);
    return result;
  } catch {
    const anvilResult = await traceViaAnvilFork(hash, config);
    if (anvilResult) {
      const result = parse(anvilResult.result as RawSkeletonResult);
      void setCachedTrace(hash, cacheKey, result);
      return result;
    }
    return {
      ...unavailable,
      error: "Failed to trace opcodes. Anvil (Foundry) may not be installed.",
    };
  }
}
