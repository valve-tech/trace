import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pool } from "./pool.js";
import { getVerifiedSource, type VerifiedSource } from "./sourceCode.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StorageLayoutEntry {
  astId: number;
  contract: string;
  label: string;
  offset: number;
  slot: string;
  type: string;
}

export interface StorageLayoutType {
  encoding: string;
  key?: string;
  label: string;
  numberOfBytes: string;
  value?: string;
  base?: string;
  members?: Array<{ astId: number; label: string; offset: number; slot: string; type: string }>;
}

export interface StorageLayout {
  storage: StorageLayoutEntry[];
  types: Record<string, StorageLayoutType>;
}

export interface CompilationResult {
  sourceMap: string;
  deployedBytecode: string;
  abi: unknown[];
  contractName: string;
  storageLayout: StorageLayout | null;
}

// ---------------------------------------------------------------------------
// Cache — compilation output is deterministic for the same source + settings
// ---------------------------------------------------------------------------

async function getCachedCompilation(address: string): Promise<CompilationResult | null> {
  const { rows } = await pool.query<{
    source_map: string;
    deployed_bytecode: string;
  }>(
    "SELECT source_map, deployed_bytecode FROM verified_sources WHERE LOWER(address) = LOWER($1) AND source_map IS NOT NULL",
    [address],
  );
  if (!rows[0] || !rows[0].source_map) return null;
  return {
    sourceMap: rows[0].source_map,
    deployedBytecode: rows[0].deployed_bytecode,
    abi: [],
    contractName: "",
    storageLayout: null, // Not cached in DB — recompile to get it
  };
}

async function cacheCompilationResult(address: string, sourceMap: string, deployedBytecode: string): Promise<void> {
  await pool.query(
    "UPDATE verified_sources SET source_map = $1, deployed_bytecode = $2 WHERE LOWER(address) = LOWER($3)",
    [sourceMap, deployedBytecode, address],
  );
}

// ---------------------------------------------------------------------------
// Extract clean solc version
// ---------------------------------------------------------------------------

function sanitizeVersion(raw: string): string {
  const clean = raw.replace(/^v/, "").replace(/\+.*$/, "").replace(/-.*$/, "");
  if (!/^\d+\.\d+\.\d+$/.test(clean)) {
    throw new Error(`Invalid compiler version: ${raw}`);
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Compile via Docker (solc in eth-security-toolbox)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Download and cache solc binary
// ---------------------------------------------------------------------------

const SOLC_CACHE_DIR = path.join(os.tmpdir(), "solc-cache");

async function getSolcBinary(version: string): Promise<string> {
  fs.mkdirSync(SOLC_CACHE_DIR, { recursive: true });
  const binaryPath = path.join(SOLC_CACHE_DIR, `solc-${version}`);

  if (fs.existsSync(binaryPath)) return binaryPath;

  // Detect platform
  const platform = process.platform === "darwin" ? "macosx-amd64" : "linux-amd64";
  const url = `https://github.com/nicola/solc-bin/raw/gh-pages/bin/soljson-v${version}.js`;

  // Try native binary first (faster)
  const nativeUrl = `https://github.com/ethereum/solidity/releases/download/v${version}/solc-${platform}`;
  try {
    console.log(`[solc] downloading native solc ${version}...`);
    const res = await fetch(nativeUrl, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(binaryPath, buffer);
      fs.chmodSync(binaryPath, 0o755);
      return binaryPath;
    }
  } catch {
    // Native binary not available for this platform/version
  }

  // Fallback: use solcjs via npx (available everywhere)
  console.log(`[solc] native binary not available, using solcjs wrapper`);
  const wrapperPath = path.join(SOLC_CACHE_DIR, `solc-wrapper-${version}.sh`);
  fs.writeFileSync(wrapperPath, `#!/bin/bash\nnpx solc@${version} "$@"\n`, "utf-8");
  fs.chmodSync(wrapperPath, 0o755);
  return wrapperPath;
}

// ---------------------------------------------------------------------------
// Compile using local solc binary or Docker fallback
// ---------------------------------------------------------------------------

function runSolc(
  projectDir: string,
  solcVersion: string,
  solcBinary: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const solcInput = JSON.stringify({
      language: "Solidity",
      sources: buildSolcSources(projectDir),
      settings: {
        outputSelection: {
          "*": {
            "*": ["abi", "storageLayout", "evm.deployedBytecode.sourceMap", "evm.deployedBytecode.object"],
          },
        },
        optimizer: { enabled: true, runs: 200 },
      },
    });

    const inputPath = path.join(projectDir, "solc-input.json");
    fs.writeFileSync(inputPath, solcInput, "utf-8");

    const proc = spawn(solcBinary, ["--standard-json"], {
      timeout: 60_000,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: projectDir,
    });

    proc.stdin.write(solcInput);
    proc.stdin.end();

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    proc.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: code ?? 1,
      });
    });

    proc.on("error", (err) => {
      resolve({ stdout: "", stderr: err.message, exitCode: 1 });
    });
  });
}

// ---------------------------------------------------------------------------
// Build solc standard JSON sources from a directory
// ---------------------------------------------------------------------------

function buildSolcSources(dir: string): Record<string, { content: string }> {
  const sources: Record<string, { content: string }> = {};

  function walk(currentDir: string, prefix: string) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(currentDir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name);
      } else if (entry.name.endsWith(".sol")) {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        const content = fs.readFileSync(path.join(currentDir, entry.name), "utf-8");
        sources[relPath] = { content };
      }
    }
  }

  walk(dir, "");
  return sources;
}

// ---------------------------------------------------------------------------
// Parse solc output to find the contract's source map
// ---------------------------------------------------------------------------

interface SolcContract {
  abi?: unknown[];
  storageLayout?: StorageLayout;
  evm?: {
    deployedBytecode?: {
      sourceMap?: string;
      object?: string;
    };
  };
}

function extractCompilationData(
  solcOutput: unknown,
  contractName: string,
): { sourceMap: string; deployedBytecode: string; storageLayout: StorageLayout | null } | null {
  const output = solcOutput as {
    contracts?: Record<string, Record<string, SolcContract>>;
    errors?: Array<{ severity: string; message: string }>;
  };

  if (!output.contracts) return null;

  // Try to find the specific contract by name
  for (const [_fileName, contracts] of Object.entries(output.contracts)) {
    for (const [name, contract] of Object.entries(contracts)) {
      if (name === contractName || !contractName) {
        const sm = contract.evm?.deployedBytecode?.sourceMap;
        const bc = contract.evm?.deployedBytecode?.object;
        if (sm && bc) {
          return { sourceMap: sm, deployedBytecode: "0x" + bc, storageLayout: contract.storageLayout ?? null };
        }
      }
    }
  }

  // Fallback: return the first contract with a source map
  for (const contracts of Object.values(output.contracts)) {
    for (const contract of Object.values(contracts)) {
      const sm = contract.evm?.deployedBytecode?.sourceMap;
      const bc = contract.evm?.deployedBytecode?.object;
      if (sm && bc) {
        return { sourceMap: sm, deployedBytecode: "0x" + bc, storageLayout: contract.storageLayout ?? null };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function compileForSourceMap(address: string): Promise<CompilationResult | null> {
  // Check cache
  const cached = await getCachedCompilation(address);
  if (cached) return cached;

  // Fetch verified source
  const source = await getVerifiedSource(address);
  if (!source || !source.compilerVersion) return null;

  const cleanVersion = sanitizeVersion(source.compilerVersion);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "solc-"));

  try {
    // Write source files with path traversal protection
    for (const file of source.sourceFiles) {
      const filePath = path.resolve(tmpDir, file.name);
      if (!filePath.startsWith(tmpDir + path.sep) && filePath !== tmpDir) {
        throw new Error(`Path traversal in source filename: ${file.name}`);
      }
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, file.content, "utf-8");
    }

    console.log(`[solc] compiling ${address} with solc ${cleanVersion}`);
    const solcBinary = await getSolcBinary(cleanVersion);
    const { stdout, stderr, exitCode } = await runSolc(tmpDir, cleanVersion, solcBinary);

    if (!stdout) {
      console.error(`[solc] compilation failed (exit ${exitCode}):`, stderr.slice(0, 300));
      return null;
    }

    let solcOutput: unknown;
    try {
      solcOutput = JSON.parse(stdout);
    } catch {
      console.error("[solc] failed to parse output");
      return null;
    }

    const extracted = extractCompilationData(solcOutput, source.contractName ?? "");
    if (!extracted) {
      console.error("[solc] no source map in compilation output");
      return null;
    }

    // Cache the result
    await cacheCompilationResult(address, extracted.sourceMap, extracted.deployedBytecode);

    console.log(`[solc] ${address}: source map generated (${extracted.sourceMap.length} chars)${extracted.storageLayout ? `, storage layout: ${extracted.storageLayout.storage.length} entries` : ""}`);

    return {
      sourceMap: extracted.sourceMap,
      deployedBytecode: extracted.deployedBytecode,
      abi: source.abi,
      contractName: source.contractName ?? "",
      storageLayout: extracted.storageLayout,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
