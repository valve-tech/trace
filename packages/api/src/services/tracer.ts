/**
 * Barrel re-export for the tracer service. Implementation lives under
 * `services/tracer/`, split by responsibility:
 *
 *   - types.ts                CallFrame / OpcodeStep / result shapes
 *   - cache.ts                PostgreSQL trace_cache (read/write/drain)
 *   - debugRpc.ts             raw fetch + isDebugUnavailable detector
 *   - anvilFallback.ts        spin up an anvil fork and replay via debug_traceCall
 *   - traceTransaction.ts     public traceTransaction (cache → debug → anvil)
 *   - traceOpcodes.ts         public traceTransactionOpcodes (struct logger)
 *   - traceCall.ts            public traceCall (simulated calls; no fallback)
 *
 * Consumers continue to `import { ... } from "./services/tracer.js"`; no
 * callsite changes when the split moved internals around.
 */

export type {
  CallFrame,
  CallTraceResult,
  OpcodeStep,
  OpcodeTraceResult,
  SkeletonStep,
  SkeletonTraceResult,
  StepDetail,
  StepDetailResult,
  TraceCallParams,
} from "./tracer/types.js";
export { awaitPendingCacheWrites } from "./tracer/cache.js";
export { traceTransaction } from "./tracer/traceTransaction.js";
export { traceTransactionOpcodes } from "./tracer/traceOpcodes.js";
export { traceOpcodesSkeleton } from "./tracer/traceSkeleton.js";
export { getOpcodeDetail } from "./tracer/opcodeDetail.js";
export { traceCall } from "./tracer/traceCall.js";
