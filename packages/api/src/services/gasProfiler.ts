/**
 * Barrel re-export for the gas profiler. Implementation lives under
 * `services/gasProfiler/`:
 *
 *   - types.ts             GasEntry / GasProfile / OpcodeCategory shapes
 *   - opcodeCategories.ts  ~110-line opcode → category lookup table
 *   - profileGas.ts        call-tree gas profile (hierarchical + flat)
 *   - profileOpcodes.ts    opcode-level category + top-N breakdown
 */

export type {
  ExpensiveOp,
  FlatGasEntry,
  GasEntry,
  GasProfile,
  OpcodeCategory,
  OpcodeProfile,
} from "./gasProfiler/types.js";
export { profileGas } from "./gasProfiler/profileGas.js";
export { profileOpcodes } from "./gasProfiler/profileOpcodes.js";
