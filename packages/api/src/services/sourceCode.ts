import { pool } from "./pool.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceFile {
  name: string;
  content: string;
}

export interface VerifiedSource {
  address: string;
  chainSource: string;
  contractName: string | null;
  compilerVersion: string | null;
  optimizationUsed: boolean;
  optimizationRuns: number | null;
  sourceFiles: SourceFile[];
  abi: unknown[];
  sourceMap: string | null;
  deployedBytecode: string | null;
}

interface BlockScoutSourceResult {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: string;
  Runs: string;
  AdditionalSources?: Array<{ Filename: string; SourceCode: string }>;
}

interface SourcifyFile {
  name: string;
  path: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BLOCKSCOUT_API_URL =
  process.env.BLOCKSCOUT_API_URL ?? "https://api.scan.pulsechain.com/api";

const SOURCIFY_API_URL = "https://sourcify.dev/server";

const FETCH_TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// BlockScout source fetch
// ---------------------------------------------------------------------------

async function fetchFromBlockScout(address: string): Promise<VerifiedSource | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const url = `${BLOCKSCOUT_API_URL}?module=contract&action=getsourcecode&address=${address}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const data = (await res.json()) as { status: string; result: BlockScoutSourceResult[] };
    if (data.status !== "1" || !data.result?.[0]) return null;

    const r = data.result[0];
    if (!r.SourceCode || r.SourceCode === "") return null;

    const sourceFiles: SourceFile[] = [
      { name: r.ContractName ? `${r.ContractName}.sol` : "Contract.sol", content: r.SourceCode },
    ];

    if (r.AdditionalSources) {
      for (const s of r.AdditionalSources) {
        sourceFiles.push({ name: s.Filename, content: s.SourceCode });
      }
    }

    let abi: unknown[] = [];
    try {
      abi = JSON.parse(r.ABI) as unknown[];
    } catch {
      // ignore
    }

    // Fetch the runtime source map from BlockScout's extended API
    let sourceMap: string | null = null;
    let deployedBytecode: string | null = null;

    try {
      const smartContractUrl = `${BLOCKSCOUT_API_URL.replace("/api", "")}/api/v2/smart-contracts/${address}`;
      const scRes = await fetch(smartContractUrl, { signal: controller.signal });
      if (scRes.ok) {
        const scData = (await scRes.json()) as {
          deployed_bytecode?: string;
          source_map?: string;
          compiler_settings?: { outputSelection?: unknown };
        };
        sourceMap = scData.source_map ?? null;
        deployedBytecode = scData.deployed_bytecode ?? null;
      }
    } catch {
      // Extended API not available, continue without source map
    }

    return {
      address: address.toLowerCase(),
      chainSource: "blockscout",
      contractName: r.ContractName || null,
      compilerVersion: r.CompilerVersion || null,
      optimizationUsed: r.OptimizationUsed === "1",
      optimizationRuns: r.Runs ? parseInt(r.Runs, 10) : null,
      sourceFiles,
      abi,
      sourceMap,
      deployedBytecode,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Sourcify fallback
// ---------------------------------------------------------------------------

async function fetchFromSourcify(address: string): Promise<VerifiedSource | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    // PulseChain chainId = 369
    const chainId = 369;

    // Try full match first, then partial
    for (const matchType of ["full_match", "partial_match"]) {
      const url = `${SOURCIFY_API_URL}/repository/contracts/${matchType}/${chainId}/${address}/`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) continue;

      // Fetch the file list
      const metadataUrl = `${SOURCIFY_API_URL}/files/${chainId}/${address}`;
      const metaRes = await fetch(metadataUrl, { signal: controller.signal });
      if (!metaRes.ok) continue;

      const files = (await metaRes.json()) as SourcifyFile[];
      const sourceFiles: SourceFile[] = [];
      let abi: unknown[] = [];
      let compilerVersion: string | null = null;

      for (const file of files) {
        if (file.name === "metadata.json") {
          try {
            const metadata = JSON.parse(file.content) as {
              compiler?: { version?: string };
              output?: { abi?: unknown[] };
            };
            compilerVersion = metadata.compiler?.version ?? null;
            abi = metadata.output?.abi ?? [];
          } catch {
            // ignore
          }
        } else if (file.name.endsWith(".sol")) {
          sourceFiles.push({ name: file.name, content: file.content });
        }
      }

      if (sourceFiles.length === 0) continue;

      return {
        address: address.toLowerCase(),
        chainSource: "sourcify",
        contractName: sourceFiles[0]?.name.replace(".sol", "") ?? null,
        compilerVersion,
        optimizationUsed: false,
        optimizationRuns: null,
        sourceFiles,
        abi,
        sourceMap: null,
        deployedBytecode: null,
      };
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Cache layer (PostgreSQL)
// ---------------------------------------------------------------------------

async function getCachedSource(address: string): Promise<VerifiedSource | null> {
  const { rows } = await pool.query<{
    address: string;
    chain_source: string;
    contract_name: string | null;
    compiler_version: string | null;
    optimization_used: boolean;
    optimization_runs: number | null;
    source_files: SourceFile[];
    abi: unknown[];
    source_map: string | null;
    deployed_bytecode: string | null;
  }>(
    "SELECT * FROM verified_sources WHERE LOWER(address) = LOWER($1)",
    [address],
  );

  if (!rows[0]) return null;

  const r = rows[0];
  return {
    address: r.address,
    chainSource: r.chain_source,
    contractName: r.contract_name,
    compilerVersion: r.compiler_version,
    optimizationUsed: r.optimization_used,
    optimizationRuns: r.optimization_runs,
    sourceFiles: r.source_files,
    abi: r.abi,
    sourceMap: r.source_map,
    deployedBytecode: r.deployed_bytecode,
  };
}

async function cacheSource(source: VerifiedSource): Promise<void> {
  await pool.query(
    `INSERT INTO verified_sources
       (address, chain_source, contract_name, compiler_version, optimization_used,
        optimization_runs, source_files, abi, source_map, deployed_bytecode)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
     ON CONFLICT (LOWER(address)) DO UPDATE SET
       chain_source = $2, contract_name = $3, compiler_version = $4,
       optimization_used = $5, optimization_runs = $6, source_files = $7::jsonb,
       abi = $8::jsonb, source_map = $9, deployed_bytecode = $10,
       fetched_at = NOW()`,
    [
      source.address,
      source.chainSource,
      source.contractName,
      source.compilerVersion,
      source.optimizationUsed,
      source.optimizationRuns,
      JSON.stringify(source.sourceFiles),
      JSON.stringify(source.abi),
      source.sourceMap,
      source.deployedBytecode,
    ],
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getVerifiedSource(address: string): Promise<VerifiedSource | null> {
  // Check cache first
  const cached = await getCachedSource(address);
  if (cached) return cached;

  // Try BlockScout
  const blockscoutResult = await fetchFromBlockScout(address);
  if (blockscoutResult) {
    await cacheSource(blockscoutResult).catch((err) => {
      console.error("[sourceCode] cache write failed:", err);
    });
    return blockscoutResult;
  }

  // Try Sourcify fallback
  const sourcifyResult = await fetchFromSourcify(address);
  if (sourcifyResult) {
    await cacheSource(sourcifyResult).catch((err) => {
      console.error("[sourceCode] cache write failed:", err);
    });
    return sourcifyResult;
  }

  return null;
}
