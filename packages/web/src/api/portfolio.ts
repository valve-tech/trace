/**
 * Portfolio holdings API client. Mirrors the backend
 * GET /api/portfolio/holdings shape (services/portfolio). Token holdings come
 * from the substreams sink; `indexed: false` means the chain isn't sunk yet
 * (native-only).
 */

export interface Holding {
  tokenAddress: string;
  symbol: string;
  name: string;
  /** on-chain token decimals — display metadata, applied in the UI. */
  decimals: number;
  /** raw integer balance (smallest unit). Scaled at the render edge. */
  balance: string;
}

export interface NativeHolding {
  symbol: string;
  /** raw integer wei balance. The UI scales it (native = 18 decimals). */
  balance: string;
}

export interface HoldingsResult {
  chainId: number;
  address: string;
  native: NativeHolding;
  holdings: Holding[];
  /** false when the chain's substreams sink table doesn't exist yet. */
  indexed: boolean;
}

export async function fetchHoldings(
  address: string,
  chainId: number,
): Promise<HoldingsResult> {
  const url = `/api/portfolio/holdings?address=${address}&chainid=${chainId}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      /* keep raw text */
    }
    throw new Error(message);
  }
  const json = (await res.json()) as { ok: boolean; result: HoldingsResult; error?: string };
  if (!json.ok) throw new Error(json.error ?? "Unknown API error");
  return json.result;
}
