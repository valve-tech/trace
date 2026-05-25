/**
 * Barrel re-export for the solc recompiler. Implementation lives under
 * `services/solcCompiler/`:
 *
 *   - types.ts             StorageLayout + CompilationResult shapes
 *   - cache.ts             verified_sources row read/write for source_map
 *   - loadCompiler.ts      download + cache soljson, wrap via solc-js
 *   - extractOutput.ts     pull contract data out of standard-json output
 *   - compileForSourceMap.ts public entry: cache → fetch → compile → parse
 */

export type {
  CompilationResult,
  StorageLayout,
  StorageLayoutEntry,
  StorageLayoutType,
} from "./solcCompiler/types.js";
export { compileForSourceMap } from "./solcCompiler/compileForSourceMap.js";
