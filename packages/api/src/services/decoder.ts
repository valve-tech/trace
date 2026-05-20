/**
 * Barrel re-export for the ABI decoder. Implementation lives under
 * `services/decoder/`:
 *
 *   - abiCache.ts   in-memory ABI cache (TTL + FIFO eviction)
 *   - fetchAbi.ts   BlockScout ABI fetch + resolveAbi priority chain
 *   - decode.ts     decodeInput / decodeOutput / decodeLogs + BigInt serialize
 */

export { fetchAbi, resolveAbi } from "./decoder/fetchAbi.js";
export { decodeInput, decodeOutput, decodeLogs } from "./decoder/decode.js";
export {
  invalidateAbiCache,
  _getAbiCacheSize,
} from "./decoder/abiCache.js";
