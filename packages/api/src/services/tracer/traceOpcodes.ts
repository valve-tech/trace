import type { OpcodeStep, OpcodeTraceResult } from "./types.js";
import { getCachedTrace, setCachedTrace } from "./cache.js";
import {
  UNAVAILABLE_MSG,
  isDebugUnavailable,
  makeDebugRpc,
} from "./debugRpc.js";
import { traceViaAnvilFork } from "./anvilFallback.js";

interface RawStructLogResult {
  structLogs?: Array<{
    pc: number;
    op: string;
    gas: number;
    gasCost: number;
    depth: number;
    stack?: string[];
    memory?: string[];
    storage?: Record<string, string>;
  }>;
  gas?: number;
  returnValue?: string;
}

/**
 * Trace a transaction at the opcode level using geth's default struct
 * logger. Walks debug RPC → anvil-fork fallback (no BlockScout fallback —
 * struct logs aren't reconstructable from internal-tx listings).
 *
 * `limit` caps the number of opcodes returned to avoid pathological
 * responses on long-running txs; the cache key is limit-specific because
 * a higher-limit result can't be served from a lower-limit cache entry.
 */
export async function traceTransactionOpcodes(
  hash: string,
  limit: number = 10000,
): Promise<OpcodeTraceResult> {
  const cacheKey = `opcodes_${limit}`;
  const cached = await getCachedTrace<OpcodeTraceResult>(hash, cacheKey);
  if (cached) {
    return { ...cached, debugAvailable: true };
  }

  const structLogConfig = {
    disableStorage: false,
    disableMemory: false,
    disableStack: false,
    limit,
  };

  const parseStructLogs = (raw: RawStructLogResult): OpcodeTraceResult => {
    const steps: OpcodeStep[] = (raw.structLogs ?? [])
      .slice(0, limit)
      .map((s) => ({
        pc: s.pc,
        op: s.op,
        gas: s.gas,
        gasCost: s.gasCost,
        depth: s.depth,
        stack: s.stack ?? [],
        memory: s.memory ?? [],
        storage: s.storage ?? {},
      }));

    return {
      steps,
      gas: raw.gas ?? 0,
      returnValue: raw.returnValue ?? "",
      error: null,
      debugAvailable: true,
    };
  };

  try {
    const rpcResult = await makeDebugRpc("debug_traceTransaction", [
      hash,
      structLogConfig,
    ]);

    if (rpcResult.error) {
      if (isDebugUnavailable(rpcResult.error)) {
        console.log(
          `[tracer] debug RPC unavailable for opcodes, trying Anvil fork for ${hash}`,
        );
        const anvilResult = await traceViaAnvilFork(hash, structLogConfig);
        if (anvilResult) {
          const result = parseStructLogs(anvilResult.result as RawStructLogResult);
          void setCachedTrace(hash, cacheKey, result);
          return result;
        }
        return {
          steps: [],
          gas: 0,
          returnValue: "",
          error: UNAVAILABLE_MSG,
          debugAvailable: false,
        };
      }
      return {
        steps: [],
        gas: 0,
        returnValue: "",
        error: `RPC error: ${rpcResult.error.message}`,
        debugAvailable: true,
      };
    }

    const result = parseStructLogs(rpcResult.result as RawStructLogResult);
    void setCachedTrace(hash, cacheKey, result);
    return result;
  } catch {
    const anvilResult = await traceViaAnvilFork(hash, structLogConfig);
    if (anvilResult) {
      const result = parseStructLogs(anvilResult.result as RawStructLogResult);
      void setCachedTrace(hash, cacheKey, result);
      return result;
    }
    return {
      steps: [],
      gas: 0,
      returnValue: "",
      error: "Failed to trace opcodes. Anvil (Foundry) may not be installed.",
      debugAvailable: false,
    };
  }
}
