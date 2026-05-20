/**
 * Barrel re-export for the EVM source-map utilities. Implementation
 * lives under `services/sourceMap/`:
 *
 *   - decode.ts       SourceMapEntry + decodeSourceMap + buildPcToOpcodeIndex
 *   - lineIndex.ts    buildLineIndex + offsetToLineCol (line tracking)
 *   - mapPc.ts        SourceLocation + one-shot mapPcToSource
 *   - precompute.ts   PrecomputedSourceMap + precomputeSourceMap + lookupPc
 *
 * Prefer `precomputeSourceMap` + `lookupPc` for hot paths (trace replay);
 * `mapPcToSource` is the one-shot convenience.
 */

export {
  decodeSourceMap,
  buildPcToOpcodeIndex,
  type SourceMapEntry,
} from "./sourceMap/decode.js";
export { mapPcToSource, type SourceLocation } from "./sourceMap/mapPc.js";
export {
  precomputeSourceMap,
  lookupPc,
  type PrecomputedSourceMap,
} from "./sourceMap/precompute.js";
