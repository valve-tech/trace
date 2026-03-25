import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pool } from "./pool.js";
import { getVerifiedSource } from "./sourceCode.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  first_markdown_element?: string;
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

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

async function getCachedResult(address: string): Promise<SlitherResult | null> {
  const { rows } = await pool.query<{
    address: string;
    findings: SlitherFinding[];
    detector_count: number;
    duration_ms: number;
    error: string | null;
    analyzed_at: string;
  }>(
    "SELECT * FROM slither_results WHERE LOWER(address) = LOWER($1) ORDER BY analyzed_at DESC LIMIT 1",
    [address],
  );

  if (!rows[0]) return null;

  const r = rows[0];
  return {
    address: r.address,
    findings: r.findings,
    detectorCount: r.detector_count,
    durationMs: r.duration_ms,
    error: r.error,
    analyzedAt: r.analyzed_at,
  };
}

async function cacheResult(result: SlitherResult): Promise<void> {
  await pool.query(
    `INSERT INTO slither_results (address, findings, detector_count, duration_ms, error)
     VALUES ($1, $2::jsonb, $3, $4, $5)`,
    [
      result.address.toLowerCase(),
      JSON.stringify(result.findings),
      result.detectorCount,
      result.durationMs,
      result.error,
    ],
  );
}

// ---------------------------------------------------------------------------
// Run Slither
// ---------------------------------------------------------------------------

function runSlitherProcess(
  projectDir: string,
  solcVersion: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const args = [
      "run", "--rm",
      "-v", `${projectDir}:/project`,
      "-w", "/project",
      "trailofbits/eth-security-toolbox",
      "bash", "-c",
      `solc-select install ${solcVersion} && solc-select use ${solcVersion} && slither . --json /dev/stdout 2>/dev/stderr || true`,
    ];

    const proc = spawn("docker", args, {
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    });

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
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Prepare project directory
// ---------------------------------------------------------------------------

function prepareProject(
  sourceFiles: Array<{ name: string; content: string }>,
  compilerVersion: string,
  optimizationUsed: boolean,
  optimizationRuns: number | null,
): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slither-"));

  // Write source files
  for (const file of sourceFiles) {
    const filePath = path.join(tmpDir, file.name);
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, file.content, "utf-8");
  }

  // Extract clean solc version (e.g., "v0.8.20+commit.abc123" → "0.8.20")
  const cleanVersion = compilerVersion
    .replace(/^v/, "")
    .replace(/\+.*$/, "")
    .replace(/\-.*$/, "");

  // Write foundry.toml for Slither to discover config
  const foundryToml = `[profile.default]
src = "."
out = "out"
libs = []
solc_version = "${cleanVersion}"
optimizer = ${optimizationUsed}
optimizer_runs = ${optimizationRuns ?? 200}
`;
  fs.writeFileSync(path.join(tmpDir, "foundry.toml"), foundryToml, "utf-8");

  // Write slither.config.json
  const slitherConfig = {
    filter_paths: ["node_modules"],
    compile_force_framework: "foundry",
  };
  fs.writeFileSync(
    path.join(tmpDir, "slither.config.json"),
    JSON.stringify(slitherConfig, null, 2),
    "utf-8",
  );

  return tmpDir;
}

// ---------------------------------------------------------------------------
// Parse Slither JSON output
// ---------------------------------------------------------------------------

function parseSlitherOutput(stdout: string): SlitherFinding[] {
  // Slither outputs JSON to stdout. Find the JSON object.
  // Sometimes there's non-JSON output before it.
  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) return [];

  const jsonStr = stdout.slice(jsonStart);

  try {
    const parsed = JSON.parse(jsonStr) as {
      success: boolean;
      error: string | null;
      results?: {
        detectors?: Array<{
          check: string;
          impact: string;
          confidence: string;
          description: string;
          elements: Array<{
            type: string;
            name: string;
            source_mapping?: {
              start: number;
              length: number;
              filename_relative: string;
              lines: number[];
            };
          }>;
          first_markdown_element?: string;
          markdown?: string;
        }>;
      };
    };

    if (!parsed.results?.detectors) return [];

    return parsed.results.detectors.map((d) => ({
      check: d.check,
      impact: d.impact as SlitherFinding["impact"],
      confidence: d.confidence as SlitherFinding["confidence"],
      description: d.description,
      elements: d.elements.map((e) => ({
        type: e.type,
        name: e.name,
        sourceMapping: e.source_mapping
          ? {
              start: e.source_mapping.start,
              length: e.source_mapping.length,
              filename_relative: e.source_mapping.filename_relative,
              lines: e.source_mapping.lines,
            }
          : undefined,
      })),
      first_markdown_element: d.first_markdown_element,
      markdown: d.markdown,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function analyzeContract(
  address: string,
  options: { skipCache?: boolean } = {},
): Promise<SlitherResult> {
  // Check cache unless explicitly skipped
  if (!options.skipCache) {
    const cached = await getCachedResult(address);
    if (cached) return cached;
  }

  const startTime = Date.now();

  // Fetch verified source
  const source = await getVerifiedSource(address);
  if (!source) {
    const result: SlitherResult = {
      address: address.toLowerCase(),
      findings: [],
      detectorCount: 0,
      durationMs: Date.now() - startTime,
      error: "Verified source not found",
      analyzedAt: new Date().toISOString(),
    };
    return result;
  }

  if (!source.compilerVersion) {
    const result: SlitherResult = {
      address: address.toLowerCase(),
      findings: [],
      detectorCount: 0,
      durationMs: Date.now() - startTime,
      error: "Compiler version not available",
      analyzedAt: new Date().toISOString(),
    };
    return result;
  }

  // Prepare temp project
  const projectDir = prepareProject(
    source.sourceFiles,
    source.compilerVersion,
    source.optimizationUsed,
    source.optimizationRuns,
  );

  try {
    // Run Slither in Docker
    console.log(`[slither] analyzing ${address} (compiler: ${source.compilerVersion})`);
    const { stdout, stderr, exitCode } = await runSlitherProcess(projectDir, source.compilerVersion);
    const durationMs = Date.now() - startTime;

    if (exitCode !== 0 && !stdout.includes('"detectors"')) {
      console.error(`[slither] failed (exit ${exitCode}):`, stderr.slice(0, 500));
      const result: SlitherResult = {
        address: address.toLowerCase(),
        findings: [],
        detectorCount: 0,
        durationMs,
        error: `Slither analysis failed: ${stderr.slice(0, 200)}`,
        analyzedAt: new Date().toISOString(),
      };
      await cacheResult(result).catch(() => {});
      return result;
    }

    const findings = parseSlitherOutput(stdout);
    const result: SlitherResult = {
      address: address.toLowerCase(),
      findings,
      detectorCount: findings.length,
      durationMs,
      error: null,
      analyzedAt: new Date().toISOString(),
    };

    console.log(`[slither] ${address}: ${findings.length} findings in ${durationMs}ms`);
    await cacheResult(result).catch((err) => {
      console.error("[slither] cache write failed:", err);
    });

    return result;
  } finally {
    // Clean up temp directory
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}
