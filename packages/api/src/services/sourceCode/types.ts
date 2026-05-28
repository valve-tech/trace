export interface SourceFile {
  name: string;
  content: string;
}

export interface VerifiedSource {
  address: string;
  /** Source provider that produced this row: "blockscout" | "sourcify" */
  chainSource: string;
  contractName: string | null;
  compilerVersion: string | null;
  optimizationUsed: boolean;
  optimizationRuns: number | null;
  sourceFiles: SourceFile[];
  abi: unknown[];
  /** Runtime source map from BlockScout's smart-contracts API, if available. */
  sourceMap: string | null;
  deployedBytecode: string | null;
}

export const BLOCKSCOUT_API_URL =
  process.env.BLOCKSCOUT_API_URL ?? "https://api.scan.pulsechain.com/api";

export const SOURCIFY_API_URL = "https://sourcify.dev/server";

export const FETCH_TIMEOUT = 15_000;

/**
 * Thrown by a source fetcher when the upstream is transiently unavailable
 * (5xx, network error, timeout) — distinct from "upstream answered and the
 * contract isn't verified" (which is null). Lets getVerifiedSource avoid
 * caching a transient outage as a permanent "not verified", and lets the
 * route surface a 503 instead of a misleading 404.
 */
export class UpstreamError extends Error {
  readonly upstream: string;
  constructor(upstream: string, message: string) {
    super(`[${upstream}] ${message}`);
    this.name = "UpstreamError";
    this.upstream = upstream;
  }
}
