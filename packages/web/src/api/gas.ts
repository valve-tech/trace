/**
 * Gas oracle API client — priority-fee tier recommendations from the
 * server-side @valve-tech/gas-oracle poller (mempool-influenced).
 */

const API_BASE = "/api/gas";

export type TierName = "slow" | "standard" | "fast" | "instant";
export type Trend = "rising" | "falling" | "stable";

/** All fee figures are wei decimal strings (serialized from bigint). */
export interface TierRecommendation {
  maxPriorityFeePerGas: string;
  maxFeePerGas: string;
  gasPrice: string;
  maxFeePerBlobGas: string | null;
}

export interface GasOracleState {
  chainId: number;
  blockNumber: string;
  baseFee: string;
  baseFeeTrend: Trend;
  mempool: {
    pendingCount: string;
    queuedCount: string;
    pendingGasDemand: string;
    blockGasLimit: string;
  };
  tiers: Record<TierName, TierRecommendation>;
}

export async function fetchGasOracle(): Promise<GasOracleState> {
  const res = await fetch(`${API_BASE}/oracle`);
  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      message = text;
    }
    throw new Error(message);
  }
  const json = (await res.json()) as {
    ok: boolean;
    result: GasOracleState;
    error?: string;
  };
  if (!json.ok) throw new Error(json.error ?? "Unknown API error");
  return json.result;
}
