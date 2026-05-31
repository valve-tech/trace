/**
 * Pure transforms for the contract-info service. The Blockscout
 * `getsourcecode` endpoint returns a verbose-string-keyed shape; this
 * module flattens it into the API's camelCase ContractInfo view, with
 * defensive defaults for unverified contracts (every string field
 * defaults to empty, `optimizationUsed` defaults to false).
 */

export interface BlockscoutSourceRow {
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: string;
  SourceCode: string;
  ConstructorArguments: string;
  EVMVersion: string;
  Library: string;
  LicenseType: string;
  Proxy: string;
  Implementation: string;
  SwarmSource: string;
  ABI: string;
}

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
 * Build the ContractInfo view from the input address, the resolved
 * ABI (from the decoder cache or null), and the optional source-code
 * row from Blockscout. A contract counts as verified when either the
 * ABI resolved OR Blockscout returned a non-empty `ContractName`.
 *
 * `optimizationUsed` is the only boolean field; Blockscout encodes it
 * as the string "1" / "0", and we map "1" → true, everything else
 * (including "" and missing) → false.
 */
export function buildContractInfo(
  address: string,
  abi: unknown[] | null,
  source: BlockscoutSourceRow | undefined,
): ContractInfoView {
  return {
    address,
    isVerified: !!abi || (!!source && source.ContractName !== ""),
    contractName: source?.ContractName ?? "",
    compilerVersion: source?.CompilerVersion ?? "",
    optimizationUsed: source?.OptimizationUsed === "1",
    sourceCode: source?.SourceCode ?? "",
    abi,
    constructorArguments: source?.ConstructorArguments ?? "",
    evmVersion: source?.EVMVersion ?? "",
    library: source?.Library ?? "",
    licenseType: source?.LicenseType ?? "",
    proxy: source?.Proxy ?? "",
    implementation: source?.Implementation ?? "",
    swarmSource: source?.SwarmSource ?? "",
  };
}
