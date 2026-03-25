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

export interface SlitherElement {
  type: string;
  name: string;
  sourceMapping?: {
    start: number;
    length: number;
    filename_relative: string;
    lines: number[];
  };
}

export interface SlitherFinding {
  check: string;
  impact: "High" | "Medium" | "Low" | "Informational" | "Optimization";
  confidence: "High" | "Medium" | "Low";
  description: string;
  elements: SlitherElement[];
  markdown?: string;
}

export interface SlitherResult {
  address: string;
  findings: SlitherFinding[];
  detectorCount: number;
  durationMs: number;
  error: string | null;
  analyzedAt: string;
}

export interface SlitherResponse {
  ok: boolean;
  analysis?: SlitherResult;
  warning?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchSource(address: string): Promise<SourceResponse> {
  const res = await fetch(`${API_BASE}/${address}`);
  return (await res.json()) as SourceResponse;
}

export async function analyzeContract(
  address: string,
  options: { skipCache?: boolean } = {},
): Promise<SlitherResponse> {
  const res = await fetch(`${API_BASE}/${address}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  return (await res.json()) as SlitherResponse;
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
