import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getVerifiedSource } from "../sourceCode.js";
import type { CompilationResult } from "./types.js";
import { cacheCompilationResult, getCachedCompilation } from "./cache.js";
import { getSolcBinary, sanitizeVersion } from "./solcBinary.js";
import { runSolc } from "./runSolc.js";
import { extractCompilationData } from "./extractOutput.js";

/**
 * Recompile a verified contract to produce a source map + deployed
 * bytecode. Cached forever on the `verified_sources` row, so the
 * expensive solc-download + recompile only happens once per address.
 *
 * Returns `null` when source isn't verified, the compiler version is
 * unknown, or any step in the pipeline fails — callers treat null as
 * "source map not available" rather than retrying.
 */
export async function compileForSourceMap(
  address: string,
): Promise<CompilationResult | null> {
  const cached = await getCachedCompilation(address);
  if (cached) return cached;

  const source = await getVerifiedSource(address);
  if (!source || !source.compilerVersion) return null;

  const cleanVersion = sanitizeVersion(source.compilerVersion);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "solc-"));

  try {
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
    const { stdout, stderr, exitCode } = await runSolc(
      tmpDir,
      cleanVersion,
      solcBinary,
    );

    if (!stdout) {
      console.error(
        `[solc] compilation failed (exit ${exitCode}):`,
        stderr.slice(0, 300),
      );
      return null;
    }

    let solcOutput: unknown;
    try {
      solcOutput = JSON.parse(stdout);
    } catch {
      console.error("[solc] failed to parse output");
      return null;
    }

    const extracted = extractCompilationData(
      solcOutput,
      source.contractName ?? "",
    );
    if (!extracted) {
      console.error("[solc] no source map in compilation output");
      return null;
    }

    await cacheCompilationResult(
      address,
      extracted.sourceMap,
      extracted.deployedBytecode,
    );

    const storageNote = extracted.storageLayout
      ? `, storage layout: ${extracted.storageLayout.storage.length} entries`
      : "";
    console.log(
      `[solc] ${address}: source map generated (${extracted.sourceMap.length} chars)${storageNote}`,
    );

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
