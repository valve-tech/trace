/**
 * Barrel re-export for the alert monitor. Implementation lives under
 * `services/monitor/`:
 *
 *   - types.ts         BlockTransaction + AlertConditions
 *   - matchers.ts      five per-alert-type matcher functions (pure-ish)
 *   - processBlock.ts  fetch block + logs, walk alerts, dispatch matches
 *   - lifecycle.ts     start/stop/pollBlocks (3s poller)
 *
 * Consumers continue to import `startMonitor` from `./services/monitor.js`.
 */

export {
  startMonitor,
  stopMonitor,
  pollBlocks,
} from "./monitor/lifecycle.js";
export { processBlock } from "./monitor/processBlock.js";
