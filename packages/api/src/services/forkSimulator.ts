/**
 * Barrel re-export for the fork-based simulator. Implementation lives
 * under `services/forkSimulator/`:
 *
 *   - types.ts             ForkSimulationRequest / Result + diff shapes
 *   - forkRpc.ts           raw JSON-RPC helpers (TODO: viem migration)
 *   - prestate.ts          prestateTracer fetch + state-diff collection
 *   - processReceipt.ts    post-send: mine, decode logs, probe return data
 *   - forkSimulate.ts      public forkSimulate (concurrency-capped)
 *   - simulateFromTxHash.ts replay a mined tx at its prior block state
 *
 * Consumers continue to import from `./services/forkSimulator.js`.
 */

export type {
  ForkSimulationRequest,
  ForkSimulationResult,
  StateDiff,
  StorageChange,
  BalanceChange,
  NonceChange,
  SimulationLog,
} from "./forkSimulator/types.js";
export { forkSimulate } from "./forkSimulator/forkSimulate.js";
export { simulateFromTxHash } from "./forkSimulator/simulateFromTxHash.js";
