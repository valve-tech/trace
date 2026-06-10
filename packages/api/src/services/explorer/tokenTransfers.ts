import { erc20Abi, type Hex } from "viem";
import { chainClient, currentChainId } from "../chains/context.js";
import {
  decodeTransferLogs,
  toTransferView,
  type TokenMeta,
  type TokenTransferView,
} from "./tokenTransfers/transforms.js";

export type TokenTransfer = TokenTransferView;

/**
 * Token transfers emitted by a transaction, decoded straight from the
 * receipt's logs (ERC-20/721/1155 standard events) — no third-party
 * explorer involved. Token name/symbol/decimals are read once per
 * (chainId, token) via RPC and memoized for the process lifetime; a token
 * whose metadata reads fail renders with empty strings rather than
 * dropping the transfer.
 */
export async function getTokenTransfers(
  hash: string,
): Promise<TokenTransfer[]> {
  let logs;
  try {
    const receipt = await chainClient().getTransactionReceipt({
      hash: hash as Hex,
    });
    logs = receipt.logs;
  } catch {
    // Pending or unknown tx — no receipt, no transfers.
    return [];
  }

  const raw = decodeTransferLogs(
    logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data })),
    hash,
  );
  if (raw.length === 0) return [];

  const tokens = [...new Set(raw.map((t) => t.contractAddress))];
  const metas = new Map<string, TokenMeta | null>();
  await Promise.all(
    tokens.map(async (token) => {
      metas.set(token, await getTokenMeta(token));
    }),
  );

  return raw.map((t) => toTransferView(t, metas.get(t.contractAddress) ?? null));
}

// ---------------------------------------------------------------------------
// Token metadata — one read per (chainId, token), memoized. Failed reads are
// NOT cached so a transient RPC hiccup self-heals on the next transfer
// instead of pinning empty metadata (the in-memory cousin of the
// idb-cache-poisoning failure mode).
// ---------------------------------------------------------------------------

const metaCache = new Map<string, TokenMeta>();

async function getTokenMeta(token: string): Promise<TokenMeta | null> {
  const key = `${currentChainId()}:${token}`;
  const cached = metaCache.get(key);
  if (cached) return cached;

  const client = chainClient();
  const address = token as Hex;
  const [name, symbol, decimals] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: "name" }).catch(() => null),
    client.readContract({ address, abi: erc20Abi, functionName: "symbol" }).catch(() => null),
    client.readContract({ address, abi: erc20Abi, functionName: "decimals" }).catch(() => null),
  ]);

  if (name === null && symbol === null && decimals === null) return null;

  const meta: TokenMeta = {
    name: name ?? "",
    symbol: symbol ?? "",
    decimals: decimals === null ? "" : String(decimals),
  };
  metaCache.set(key, meta);
  return meta;
}
