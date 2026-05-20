/**
 * Barrel re-export for verified-source fetching. Implementation lives
 * under `services/sourceCode/`:
 *
 *   - types.ts                SourceFile + VerifiedSource + URL constants
 *   - cache.ts                verified_sources read/write (UPSERT)
 *   - blockscout.ts           v1 getsourcecode + v2 smart-contracts fetch
 *   - sourcify.ts             chainId-369 full_match + partial_match
 *   - getVerifiedSource.ts    public entry with negative cache
 */

export type { SourceFile, VerifiedSource } from "./sourceCode/types.js";
export { getVerifiedSource } from "./sourceCode/getVerifiedSource.js";
