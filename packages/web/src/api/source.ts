const API_BASE = "/api/source";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceFile {
  name: string;
  content: string;
}

export interface ContractSource {
  address: string;
  chainSource: string;
  contractName: string | null;
  compilerVersion: string | null;
  optimizationUsed: boolean;
  optimizationRuns: number | null;
  files: SourceFile[];
  abi: unknown[];
  hasSourceMap: boolean;
  hasDeployedBytecode: boolean;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  sourceSnippet: string;
}

export interface SourceResponse {
  ok: boolean;
  source?: ContractSource;
  error?: string;
  hint?: string;
}

export interface SourceMapResponse {
  ok: boolean;
  mappings?: Record<number, SourceLocation | null>;
  error?: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchSource(address: string): Promise<SourceResponse> {
  const res = await fetch(`${API_BASE}/${address}`);
  return (await res.json()) as SourceResponse;
}

export async function fetchSourceMappings(
  address: string,
  pcs: number[],
): Promise<SourceMapResponse> {
  const res = await fetch(`${API_BASE}/${address}/map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pcs }),
  });
  return (await res.json()) as SourceMapResponse;
}
