import { type Address, type Hex, formatEther } from "viem";
import { publicClient } from "../rpc.js";
import { blockscoutFetch } from "./client.js";
import {
  extractTxTypeAndFees,
  LEGACY_FALLBACK_FEES,
  mapTokenRow,
  mapTxListRow,
  type AddressTransactionBase,
  type BlockscoutTokenRow,
  type BlockscoutTxListRow,
} from "./addresses/transforms.js";

// ---------------------------------------------------------------------------
// Address transactions
// ---------------------------------------------------------------------------

export type AddressTransaction = AddressTransactionBase & {
  /** Enriched from the node — BlockScout's txlist omits these. */
  type: string;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
};

export async function getAddressTransactions(
  address: string,
  page: number = 1,
  limit: number = 25,
): Promise<{ transactions: AddressTransaction[]; total: number }> {
  const data = await blockscoutFetch<{
    status: string;
    result: BlockscoutTxListRow[];
  }>({
    module: "account",
    action: "txlist",
    address,
    page: page.toString(),
    offset: limit.toString(),
    sort: "desc",
  });

  if (!data || data.status !== "1" || !Array.isArray(data.result)) {
    return { transactions: [], total: 0 };
  }

  const base = data.result.map(mapTxListRow);

  // BlockScout's txlist omits tx-type + the 1559 fee caps, so enrich from the
  // node. viem batches these getTransaction calls into one HTTP round-trip
  // (batch transport in rpc.ts). Per-tx failures fall back to legacy/null.
  const transactions: AddressTransaction[] = await Promise.all(
    base.map(async (tx) => {
      try {
        const full = await publicClient.getTransaction({ hash: tx.hash as Hex });
        return { ...tx, ...extractTxTypeAndFees(full) };
      } catch {
        return { ...tx, ...LEGACY_FALLBACK_FEES };
      }
    }),
  );

  return { transactions, total: transactions.length };
}

// ---------------------------------------------------------------------------
// Address tokens
// ---------------------------------------------------------------------------

export interface AddressToken {
  balance: string;
  formattedBalance: string;
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: string;
  type: string;
}

export async function getAddressTokens(
  address: string,
): Promise<AddressToken[]> {
  const data = await blockscoutFetch<{
    status: string;
    result: BlockscoutTokenRow[];
  }>({
    module: "account",
    action: "tokenlist",
    address,
  });

  if (!data || data.status !== "1" || !Array.isArray(data.result)) {
    return [];
  }

  return data.result.map(mapTokenRow);
}

// ---------------------------------------------------------------------------
// Balance + contract-check
// ---------------------------------------------------------------------------

export async function getAddressBalance(
  address: string,
): Promise<{ balance: string; balancePLS: string }> {
  const balance = await publicClient.getBalance({
    address: address as Address,
  });
  return {
    balance: balance.toString(),
    balancePLS: formatEther(balance),
  };
}

export async function isContract(address: string): Promise<boolean> {
  try {
    const code = await publicClient.getCode({ address: address as Address });
    return !!code && code !== "0x";
  } catch {
    return false;
  }
}
