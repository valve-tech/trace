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
