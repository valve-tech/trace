import { fetchAbi } from "../decoder.js";
import { blockscoutFetch } from "./client.js";
import {
  buildContractInfo,
  type BlockscoutSourceRow,
  type ContractInfoView,
} from "./contracts/transforms.js";

export type ContractInfo = ContractInfoView;

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
    result: BlockscoutSourceRow[];
  }>({
    module: "contract",
    action: "getsourcecode",
    address,
  });

  return buildContractInfo(address, abi as unknown[] | null, data?.result?.[0]);
}
