import { apiUrl } from "../lib/apiBase";
import { DEFAULT_CHAIN_ID } from "../lib/chains";
/**
 * Gas oracle API client — priority-fee tier recommendations from the
 * server-side @valve-tech/gas-oracle poller (mempool-influenced).
 */

const API_BASE = apiUrl("/api/gas");

/**
 * Scope a request to a chain via `?chainid=N`. The default chain is omitted so
 * existing PulseChain calls stay byte-identical; non-default chains append the
 * param, which the backend chain-context middleware reads. Mirrors the private
 * `scoped` helper in explorer.ts — kept local per module by design.
 */
function scoped(url: string, chainId: number): string {
  if (chainId === DEFAULT_CHAIN_ID) return url;
  return url + (url.includes("?") ? "&" : "?") + `chainid=${chainId}`;
}

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

export async function fetchGasOracle(
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<GasOracleState> {
  const res = await fetch(scoped(`${API_BASE}/oracle`, chainId));
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
