import { type Hex, formatUnits } from "viem";
import { publicClient } from "../rpc.js";
import { BLOCKSCOUT_API, blockscoutFetch } from "./client.js";

export interface TokenTransfer {
  from: string;
  to: string;
  value: string;
  formattedValue: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
  hash: string;
}

/**
 * Token transfers emitted by a transaction. Prefers BlockScout v2's per-tx
 * endpoint (cheap, exact match) and falls back to v1's address-based
 * `tokentx` listing filtered down to the requested hash (slower but works
 * on instances that haven't enabled v2 yet).
 */
export async function getTokenTransfers(
  hash: string,
): Promise<TokenTransfer[]> {
  const v2 = await fetchV2(hash);
  if (v2) return v2;
  return fetchV1Fallback(hash);
}

async function fetchV2(hash: string): Promise<TokenTransfer[] | null> {
  const base = BLOCKSCOUT_API.replace("/api", "");
  try {
    const res = await fetch(
      `${base}/api/v2/transactions/${hash}/token-transfers`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: Array<{
        from: { hash: string };
        to: { hash: string };
        total: { value: string; decimals: string };
        token: {
          name: string;
          symbol: string;
          address: string;
          decimals: string;
        };
      }>;
    };
    if (!data.items?.length) return null;

    return data.items.map((t) => ({
      from: t.from.hash,
      to: t.to.hash,
      value: t.total.value,
      formattedValue: safeFormatUnits(t.total.value, t.token.decimals),
      tokenName: t.token.name,
      tokenSymbol: t.token.symbol,
      tokenDecimal: t.token.decimals,
      contractAddress: t.token.address,
      hash,
    }));
  } catch {
    return null;
  }
}

async function fetchV1Fallback(hash: string): Promise<TokenTransfer[]> {
  let tx: { from: string } | null = null;
  try {
    tx = await publicClient.getTransaction({ hash: hash as Hex });
  } catch {
    return [];
  }
  if (!tx) return [];

  const data = await blockscoutFetch<{
    status: string;
    result: Array<{
      from: string;
      to: string;
      value: string;
      tokenName: string;
      tokenSymbol: string;
      tokenDecimal: string;
      contractAddress: string;
      hash: string;
    }>;
  }>({
    module: "account",
    action: "tokentx",
    address: tx.from,
  });

  if (!data || data.status !== "1" || !Array.isArray(data.result)) return [];

  const filtered = data.result.filter(
    (t) => t.hash.toLowerCase() === hash.toLowerCase(),
  );

  return filtered.map((t) => ({
    from: t.from,
    to: t.to,
    value: t.value,
    formattedValue: safeFormatUnits(t.value, t.tokenDecimal),
    tokenName: t.tokenName,
    tokenSymbol: t.tokenSymbol,
    tokenDecimal: t.tokenDecimal,
    contractAddress: t.contractAddress,
    hash: t.hash,
  }));
}

function safeFormatUnits(value: string, decimalsStr: string | undefined): string {
  const decimals = parseInt(decimalsStr || "18", 10);
  try {
    return formatUnits(BigInt(value || "0"), decimals);
  } catch {
    return value;
  }
}
