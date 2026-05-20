import type { SolcContract, StorageLayout } from "./types.js";

export interface ExtractedCompilation {
  sourceMap: string;
  deployedBytecode: string;
  storageLayout: StorageLayout | null;
}

/**
 * Find the matching contract inside solc's standard-json output and
 * pull out the source map + bytecode. Search order:
 *
 *   1. Exact name match (`contractName === "MyContract"`).
 *   2. Any contract if `contractName` is empty (used by callers that
 *      don't know the name yet).
 *   3. First contract in the output that has both sourceMap and
 *      deployedBytecode — a fallback for verified contracts whose
 *      BlockScout-reported name doesn't match the source file's name.
 *
 * Returns `null` when nothing matches.
 */
export function extractCompilationData(
  solcOutput: unknown,
  contractName: string,
): ExtractedCompilation | null {
  const output = solcOutput as {
    contracts?: Record<string, Record<string, SolcContract>>;
    errors?: Array<{ severity: string; message: string }>;
  };

  if (!output.contracts) return null;

  for (const contracts of Object.values(output.contracts)) {
    for (const [name, contract] of Object.entries(contracts)) {
      if (name === contractName || !contractName) {
        const found = pickIfComplete(contract);
        if (found) return found;
      }
    }
  }

  for (const contracts of Object.values(output.contracts)) {
    for (const contract of Object.values(contracts)) {
      const found = pickIfComplete(contract);
      if (found) return found;
    }
  }

  return null;
}

function pickIfComplete(contract: SolcContract): ExtractedCompilation | null {
  const sm = contract.evm?.deployedBytecode?.sourceMap;
  const bc = contract.evm?.deployedBytecode?.object;
  if (!sm || !bc) return null;
  return {
    sourceMap: sm,
    deployedBytecode: "0x" + bc,
    storageLayout: contract.storageLayout ?? null,
  };
}
