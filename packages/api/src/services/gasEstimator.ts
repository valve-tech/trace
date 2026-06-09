import type { Address, Hex } from "viem";
import { chainClient } from "./chains/context.js";

export interface GasEstimateParams {
  from?: Address;
  to?: Address;
  value?: bigint;
  data?: Hex;
  gas?: bigint;
  gasPrice?: bigint;
}

/**
 * Estimate gas for a transaction against PulseChain.
 * Returns the estimated gas as a bigint, or `null` if the estimation fails
 * (e.g., the transaction would revert).
 */
export async function estimateGas(
  params: GasEstimateParams,
): Promise<bigint | null> {
  try {
    const estimate = await chainClient().estimateGas({
      account: params.from ?? ("0x0000000000000000000000000000000000000000" as Address),
      to: params.to ?? undefined,
      value: params.value,
      data: params.data,
      gas: params.gas,
      gasPrice: params.gasPrice,
    });
    return estimate;
  } catch {
    return null;
  }
}
