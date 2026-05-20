import { fetchAbi } from "../decoder.js";
import { blockscoutFetch } from "./client.js";

export interface ContractInfo {
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
 * Resolve ABI + verified-source metadata for a contract. ABI may come from a
 * decoder cache; source code comes from BlockScout's `getsourcecode`. If
 * neither produces a name, `isVerified` is false and string fields default
 * to empty — the caller decides what to render.
 */
export async function getContractInfo(
  address: string,
): Promise<ContractInfo> {
  const abi = await fetchAbi(address);

  const data = await blockscoutFetch<{
    status: string;
    result: Array<{
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
    }>;
  }>({
    module: "contract",
    action: "getsourcecode",
    address,
  });

  const source = data?.result?.[0];

  return {
    address,
    isVerified: !!abi || (!!source && source.ContractName !== ""),
    contractName: source?.ContractName ?? "",
    compilerVersion: source?.CompilerVersion ?? "",
    optimizationUsed: source?.OptimizationUsed === "1",
    sourceCode: source?.SourceCode ?? "",
    abi: abi as unknown[] | null,
    constructorArguments: source?.ConstructorArguments ?? "",
    evmVersion: source?.EVMVersion ?? "",
    library: source?.Library ?? "",
    licenseType: source?.LicenseType ?? "",
    proxy: source?.Proxy ?? "",
    implementation: source?.Implementation ?? "",
    swarmSource: source?.SwarmSource ?? "",
  };
}
