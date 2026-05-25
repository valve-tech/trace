import { getVerifiedSource } from "../sourceCode.js";
import type { CompilationResult } from "./types.js";
import { cacheCompilationResult, getCachedCompilation } from "./cache.js";
import { getCompiler, resolveFullVersion } from "./loadCompiler.js";
import { extractCompilationData } from "./extractOutput.js";

/**
 * Recompile a verified contract to produce a source map + deployed bytecode.
 * Cached forever on the `verified_sources` row, so the expensive
 * soljson-download + recompile only happens once per address.
 *
 * Uses the verified contract's OWN optimizer settings — compiling with the
 * wrong settings yields bytecode that doesn't match what's deployed, so the
 * PC→source-map index would be misaligned with the trace's real program
 * counters. (The previous spawn-based path hardcoded `optimizer enabled/200`,
 * which silently broke mapping for unoptimized contracts like HEX.)
 *
 * Returns `null` when source isn't verified, the compiler version is unknown,
 * or any step fails — callers treat null as "source map not available".
 */
export async function compileForSourceMap(
  address: string,
): Promise<CompilationResult | null> {
  const cached = await getCachedCompilation(address);
  if (cached) return cached;

  const source = await getVerifiedSource(address);
  if (!source || !source.compilerVersion) return null;

  try {
    const fullVersion = await resolveFullVersion(source.compilerVersion);
    const compiler = await getCompiler(fullVersion);

    const sources: Record<string, { content: string }> = {};
    for (const file of source.sourceFiles) {
      sources[file.name] = { content: file.content };
    }

    const input = {
      language: "Solidity",
      sources,
      settings: {
        optimizer: {
          enabled: source.optimizationUsed,
          runs: source.optimizationRuns ?? 200,
        },
        outputSelection: {
          "*": {
            "*": [
              "abi",
              "storageLayout",
              "evm.deployedBytecode.sourceMap",
              "evm.deployedBytecode.object",
            ],
          },
        },
      },
    };

    console.log(`[solc] compiling ${address} with solc ${fullVersion}`);
    const output = JSON.parse(compiler.compile(JSON.stringify(input))) as unknown;

    const extracted = extractCompilationData(output, source.contractName ?? "");
    if (!extracted) {
      const errs = (output as { errors?: Array<{ severity: string; formattedMessage?: string; message?: string }> })
        .errors?.filter((e) => e.severity === "error")
        .map((e) => e.formattedMessage ?? e.message)
        .join("; ");
      console.error(
        `[solc] no source map for ${address}:`,
        errs ? errs.slice(0, 300) : "no matching contract in output",
      );
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
  } catch (err) {
    console.warn(
      `[solc] recompilation failed for ${address}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
