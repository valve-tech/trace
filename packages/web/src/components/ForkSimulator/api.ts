import { apiUrl } from "../../lib/apiBase";
import { DEFAULT_CHAIN_ID } from "../../lib/chains";
import { scoped } from "../../api/chainScope";
import type { ForkSimulationResponse } from "../../api/simulate";

/**
 * Fork-simulate on `chainId`, threaded as the `?chainid=N` dispatcher param
 * (the default chain omits it, matching the backend's 369 fallback) — the
 * backend spawns the anvil fork against that chain's upstream RPC.
 */
export async function forkSimulateApi(
  params: {
    from: string;
    to: string;
    value?: string;
    data?: string;
    blockNumber?: number;
  },
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<ForkSimulationResponse> {
  const res = await fetch(scoped(apiUrl("/api/simulate/fork"), chainId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return (await res.json()) as ForkSimulationResponse;
}

/** Re-simulate a mined tx on a fork of `chainId` (the chain it was mined on). */
export async function simulateFromHashApi(
  txHash: string,
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<ForkSimulationResponse> {
  const res = await fetch(scoped(apiUrl("/api/simulate/from-hash"), chainId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txHash }),
  });
  return (await res.json()) as ForkSimulationResponse;
}
