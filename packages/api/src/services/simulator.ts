/**
 * Barrel re-export for the transaction simulator. Implementation lives
 * under `services/simulator/`:
 *
 *   - stateOverride.ts        user → viem state-override shape conversion
 *   - revertReason.ts         extract human-readable revert from viem errors
 *   - simulateTransaction.ts  single-tx eth_call + decode + gas estimate
 *   - simulateBundle.ts       sequential bundle with cumulative overrides
 */

export { simulateTransaction } from "./simulator/simulateTransaction.js";
export { simulateBundle } from "./simulator/simulateBundle.js";
