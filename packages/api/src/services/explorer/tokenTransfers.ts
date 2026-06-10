import { type Hex } from "viem";
import { chainClient } from "../chains/context.js";
import { blockscoutFetch, blockscoutV2Base } from "./client.js";
import {
  mapV1Row,
  mapV2Row,
  type BlockscoutV1Row,
  type BlockscoutV2Row,
  type TokenTransferView,
} from "./tokenTransfers/transforms.js";

export type TokenTransfer = TokenTransferView;

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
  const base = blockscoutV2Base();
  if (base === null) return null;
  try {
    const res = await fetch(
      `${base}/api/v2/transactions/${hash}/token-transfers`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: BlockscoutV2Row[] };
    if (!data.items?.length) return null;
    return data.items.map((row) => mapV2Row(row, hash));
  } catch {
    return null;
  }
}

async function fetchV1Fallback(hash: string): Promise<TokenTransfer[]> {
  let tx: { from: string } | null = null;
  try {
    tx = await chainClient().getTransaction({ hash: hash as Hex });
  } catch {
    return [];
  }
  if (!tx) return [];

  const data = await blockscoutFetch<{
    status: string;
    result: BlockscoutV1Row[];
  }>({
    module: "account",
    action: "tokentx",
    address: tx.from,
  });

  if (!data || data.status !== "1" || !Array.isArray(data.result)) return [];

  return data.result
    .filter((t) => t.hash.toLowerCase() === hash.toLowerCase())
    .map(mapV1Row);
}
