import fs from "node:fs";
import { getVerifiedSource } from "../sourceCode.js";
import type { SlitherResult } from "./types.js";
import { cacheResult, getCachedResult } from "./cache.js";
import { prepareProject } from "./prepareProject.js";
import { runSlitherProcess } from "./runSlither.js";
import { parseSlitherOutput } from "./parseOutput.js";

/**
 * Run a Slither static analysis on a contract, with caching by address.
 * Walks: cache → fetch verified source → write tmp project → run Slither
 * → parse JSON → cache the result. Errors are turned into `SlitherResult`
 * objects with an `error` field rather than thrown — keeps the failure
 * mode uniform across "source not verified," "compiler version missing,"
 * and "slither exited non-zero."
 *
 * Pass `skipCache: true` to bypass the cached result; the fresh analysis
 * is still written back to the cache afterwards.
 */
export async function analyzeContract(
  address: string,
  options: { skipCache?: boolean } = {},
): Promise<SlitherResult> {
  if (!options.skipCache) {
    const cached = await getCachedResult(address);
    if (cached) return cached;
  }

  const startTime = Date.now();

  const source = await getVerifiedSource(address);
  if (!source) {
    return resultWithError(address, startTime, "Verified source not found");
  }
  if (!source.compilerVersion) {
    return resultWithError(address, startTime, "Compiler version not available");
  }

  const { tmpDir: projectDir, cleanVersion } = prepareProject(
    source.sourceFiles,
    source.compilerVersion,
    source.optimizationUsed,
    source.optimizationRuns,
  );

  try {
    console.log(`[slither] analyzing ${address} (compiler: ${cleanVersion})`);
    const { stdout, stderr, exitCode } = await runSlitherProcess(
      projectDir,
      cleanVersion,
    );
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
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

function resultWithError(
  address: string,
  startTime: number,
  message: string,
): SlitherResult {
  return {
    address: address.toLowerCase(),
    findings: [],
    detectorCount: 0,
    durationMs: Date.now() - startTime,
    error: message,
    analyzedAt: new Date().toISOString(),
  };
}
