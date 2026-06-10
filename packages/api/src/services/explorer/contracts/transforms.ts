/**
 * Pure transforms for the contract-info service. Builds the API's camelCase
 * ContractInfo view from a resolved VerifiedSource (Sourcify-first via
 * getVerifiedSource), with defensive defaults for unverified contracts
 * (every string field defaults to empty, `optimizationUsed` to false).
 */

import type { VerifiedSource } from "../../sourceCode.js";

export interface ContractInfoView {
  address: string;
  isVerified: boolean;
  contractName: string;
  compilerVersion: string;
  optimizationUsed: boolean;
  sourceCode: string;
  abi: unknown[] | null;
  constructorArguments: string;
  evmVersion: string;
  library: string;
  licenseType: string;
  proxy: string;
  implementation: string;
  swarmSource: string;
}

/**
 * Flatten a multi-file source into the single `sourceCode` string the wire
 * shape carries: one file passes through verbatim; multiple files get
 * `// File: <name>` separators (the convention block explorers use for
 * flattened views).
 */
export function flattenSourceFiles(
  files: VerifiedSource["sourceFiles"],
): string {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0]!.content;
  return files
    .map((f) => `// File: ${f.name}\n${f.content}`)
    .join("\n\n");
}

/**
 * Build the ContractInfo view from the resolved verified source (or null
 * for an unverified contract). Verification metadata that only Etherscan-
 * style explorers expose (constructor args, EVM version, license, proxy
 * resolution, swarm hash) isn't part of the Sourcify shape — those fields
 * stay empty.
 */
export function buildContractInfo(
  address: string,
  source: VerifiedSource | null,
): ContractInfoView {
  return {
    address,
    isVerified: source !== null,
    contractName: source?.contractName ?? "",
    compilerVersion: source?.compilerVersion ?? "",
    optimizationUsed: source?.optimizationUsed ?? false,
    sourceCode: source ? flattenSourceFiles(source.sourceFiles) : "",
    abi: source && Array.isArray(source.abi) && source.abi.length > 0 ? source.abi : null,
    constructorArguments: "",
    evmVersion: "",
    library: "",
    licenseType: "",
    proxy: "",
    implementation: "",
    swarmSource: "",
  };
}
