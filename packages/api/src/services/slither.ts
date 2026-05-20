/**
 * Barrel re-export for the Slither integration. Implementation lives
 * under `services/slither/`:
 *
 *   - types.ts           SlitherElement / Finding / Result shapes
 *   - cache.ts           Postgres slither_results read/write
 *   - prepareProject.ts  tmp dir + foundry.toml + slither.config.json
 *   - runSlither.ts      Docker spawn (trailofbits/eth-security-toolbox)
 *   - parseOutput.ts     extract findings from Slither JSON
 *   - analyzeContract.ts public entry: cache → fetch source → run → parse
 */

export type {
  SlitherElement,
  SlitherFinding,
  SlitherResult,
} from "./slither/types.js";
export { analyzeContract } from "./slither/analyzeContract.js";
