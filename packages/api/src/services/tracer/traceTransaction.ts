import type { CallFrame, CallTraceResult } from "./types.js";
import { getCachedTrace, setCachedTrace } from "./cache.js";
import { isDebugUnavailable, makeDebugRpc } from "./debugRpc.js";
import { traceViaAnvilFork } from "./anvilFallback.js";
import { traceViaBlockScout } from "./blockscoutFallback.js";

/**
 * Trace a mined transaction and return a callTracer-shaped tree. Walks
 * three sources in order: cache → live debug_ RPC → anvil-fork replay →
 * BlockScout reconstruction. Cache hits short-circuit everything else.
 *
 * `debugAvailable` on the result tells the caller whether the data came
 * from a debug-capable source; clients use this to gate features like
 * opcode-level inspection.
 */
export async function traceTransaction(
  hash: string,
): Promise<CallTraceResult> {
  const cached = await getCachedTrace<CallFrame>(hash, "calltree");
  if (cached) {
    return { trace: cached, error: null, debugAvailable: true };
  }

  const tracerConfig = {
    tracer: "callTracer",
    tracerConfig: { withLog: false },
  };

  try {
    const rpcResult = await makeDebugRpc("debug_traceTransaction", [
      hash,
      tracerConfig,
    ]);

    if (rpcResult.error) {
      if (isDebugUnavailable(rpcResult.error)) {
        console.log(
          `[tracer] debug RPC unavailable, trying Anvil fork for ${hash}`,
        );
        const anvilResult = await traceViaAnvilFork(hash, tracerConfig);
        if (anvilResult) {
          const trace = anvilResult.result as CallFrame;
          void setCachedTrace(hash, "calltree", trace);
          return { trace, error: null, debugAvailable: true };
        }
        return traceViaBlockScout(hash);
      }
      return {
        trace: null,
        error: `RPC error: ${rpcResult.error.message}`,
        debugAvailable: true,
      };
    }

    const trace = rpcResult.result as CallFrame;
    void setCachedTrace(hash, "calltree", trace);
    return { trace, error: null, debugAvailable: true };
  } catch {
    const anvilResult = await traceViaAnvilFork(hash, tracerConfig);
    if (anvilResult) {
      const trace = anvilResult.result as CallFrame;
      void setCachedTrace(hash, "calltree", trace);
      return { trace, error: null, debugAvailable: true };
    }
    return traceViaBlockScout(hash);
  }
}
