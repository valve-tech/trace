import {
  BLOCKSCOUT_API_URL,
  FETCH_TIMEOUT,
  type SourceFile,
  type VerifiedSource,
} from "./types.js";

interface BlockScoutSourceResult {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: string;
  Runs: string;
  AdditionalSources?: Array<{ Filename: string; SourceCode: string }>;
}

/**
 * Fetch verified source from BlockScout's v1 `getsourcecode` endpoint.
 * Returns `null` on any failure or unverified contract.
 *
 * Also reaches into the v2 `smart-contracts/{address}` endpoint when
 * available to pick up `source_map` and `deployed_bytecode` — useful for
 * the source-mapped debugger view. v2 may not be enabled on every
 * BlockScout instance; absence isn't fatal.
 */
export async function fetchFromBlockScout(
  address: string,
): Promise<VerifiedSource | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const url = `${BLOCKSCOUT_API_URL}?module=contract&action=getsourcecode&address=${address}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      status: string;
      result: BlockScoutSourceResult[];
    };
    if (data.status !== "1" || !data.result?.[0]) return null;

    const r = data.result[0];
    if (!r.SourceCode || r.SourceCode === "") return null;

    const sourceFiles: SourceFile[] = [
      {
        name: r.ContractName ? `${r.ContractName}.sol` : "Contract.sol",
        content: r.SourceCode,
      },
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
      // ignore — empty abi is fine
    }

    const { sourceMap, deployedBytecode } = await fetchSmartContractV2(
      address,
      controller.signal,
    );

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

async function fetchSmartContractV2(
  address: string,
  signal: AbortSignal,
): Promise<{ sourceMap: string | null; deployedBytecode: string | null }> {
  try {
    const url = `${BLOCKSCOUT_API_URL.replace("/api", "")}/api/v2/smart-contracts/${address}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return { sourceMap: null, deployedBytecode: null };
    const data = (await res.json()) as {
      deployed_bytecode?: string;
      source_map?: string;
    };
    return {
      sourceMap: data.source_map ?? null,
      deployedBytecode: data.deployed_bytecode ?? null,
    };
  } catch {
    return { sourceMap: null, deployedBytecode: null };
  }
}
