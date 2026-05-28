import {
  FETCH_TIMEOUT,
  SOURCIFY_API_URL,
  UpstreamError,
  type SourceFile,
  type VerifiedSource,
} from "./types.js";

interface SourcifyFile {
  name: string;
  path: string;
  content: string;
}

/**
 * Fetch verified source from Sourcify. Used when BlockScout doesn't have
 * the contract. Sourcify distinguishes "full" (bytecode + metadata match
 * exactly) and "partial" (metadata-only) matches — we try full first and
 * fall back to partial.
 *
 * PulseChain mainnet chainId is 369; this is hardcoded because Sourcify
 * requires the chain in the URL and we only serve PulseChain today.
 */
export async function fetchFromSourcify(
  address: string,
): Promise<VerifiedSource | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const chainId = 369;

    for (const matchType of ["full_match", "partial_match"]) {
      const url = `${SOURCIFY_API_URL}/repository/contracts/${matchType}/${chainId}/${address}/`;
      let res: Response;
      try {
        res = await fetch(url, { signal: controller.signal });
      } catch (err) {
        throw new UpstreamError(
          "sourcify",
          err instanceof Error ? err.message : "network error",
        );
      }
      if (res.status >= 500) throw new UpstreamError("sourcify", `HTTP ${res.status}`);
      if (!res.ok) continue; // 404 = not in this match-type bucket; try the next

      const metadataUrl = `${SOURCIFY_API_URL}/files/${chainId}/${address}`;
      let metaRes: Response;
      try {
        metaRes = await fetch(metadataUrl, { signal: controller.signal });
      } catch (err) {
        throw new UpstreamError(
          "sourcify",
          err instanceof Error ? err.message : "network error",
        );
      }
      if (metaRes.status >= 500) throw new UpstreamError("sourcify", `HTTP ${metaRes.status}`);
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
            // ignore — metadata may not parse for partial matches
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
  } catch (err) {
    // Let UpstreamError propagate so getVerifiedSource can distinguish
    // "sourcify is down" from "sourcify said this contract isn't there".
    if (err instanceof UpstreamError) throw err;
    return null;
  } finally {
    clearTimeout(timer);
  }
}
