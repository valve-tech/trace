/**
 * Barrel re-export for the alert monitor. Implementation lives under
 * `services/monitor/`:
 *
 *   - types.ts         BlockTransaction + AlertConditions
 *   - matchers.ts      five per-alert-type matcher functions (pure-ish)
 *   - processBlock.ts  fetch block + logs, walk a chain's alerts, dispatch
 *   - lifecycle.ts     start/stop + per-chain watchers (3s poller covering
 *                      every registered chain)
 *
 * Consumers continue to import `startMonitor` from `./services/monitor.js`.
 */

export {
  startMonitor,
  stopMonitor,
  pollAllChains,
  pollChain,
} from "./monitor/lifecycle.js";
export { processBlock } from "./monitor/processBlock.js";
