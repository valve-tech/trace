import { type Address, type Hex, formatEther, formatUnits } from "viem";
import { publicClient } from "../rpc.js";
import { blockscoutFetch } from "./client.js";

// ---------------------------------------------------------------------------
// Address transactions
// ---------------------------------------------------------------------------

export interface AddressTransaction {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  valuePLS: string;
  gas: string;
  gasUsed: string;
  gasPrice: string;
  isError: string;
  functionName: string;
  methodId: string;
  input: string;
  /** Enriched from the node — BlockScout's txlist omits these. */
  type: string;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
}

export async function getAddressTransactions(
  address: string,
  page: number = 1,
  limit: number = 25,
): Promise<{ transactions: AddressTransaction[]; total: number }> {
  const data = await blockscoutFetch<{
    status: string;
    result: Array<{
      hash: string;
      blockNumber: string;
      timeStamp: string;
      from: string;
      to: string;
      value: string;
      gas: string;
      gasUsed: string;
      gasPrice: string;
      isError: string;
      functionName: string;
      methodId: string;
      input: string;
    }>;
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

  const base = data.result.map((tx) => ({
    hash: tx.hash,
    blockNumber: tx.blockNumber,
    timeStamp: tx.timeStamp,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    valuePLS: formatEther(BigInt(tx.value || "0")),
    gas: tx.gas,
    gasUsed: tx.gasUsed,
    gasPrice: tx.gasPrice,
    isError: tx.isError,
    functionName: tx.functionName || "",
    methodId: tx.methodId || "",
    input: tx.input,
  }));

  // BlockScout's txlist omits tx-type + the 1559 fee caps, so enrich from the
  // node. viem batches these getTransaction calls into one HTTP round-trip
  // (batch transport in rpc.ts). Per-tx failures fall back to legacy/null.
  const transactions: AddressTransaction[] = await Promise.all(
    base.map(async (tx) => {
      try {
        const full = await publicClient.getTransaction({ hash: tx.hash as Hex });
        const g = full as {
          maxFeePerGas?: bigint;
          maxPriorityFeePerGas?: bigint;
        };
        return {
          ...tx,
          type: full.type ?? "legacy",
          maxFeePerGas: g.maxFeePerGas != null ? g.maxFeePerGas.toString() : null,
          maxPriorityFeePerGas:
            g.maxPriorityFeePerGas != null
              ? g.maxPriorityFeePerGas.toString()
              : null,
        };
      } catch {
        return { ...tx, type: "legacy", maxFeePerGas: null, maxPriorityFeePerGas: null };
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
    result: Array<{
      balance: string;
      contractAddress: string;
      name: string;
      symbol: string;
      decimals: string;
      type: string;
    }>;
  }>({
    module: "account",
    action: "tokenlist",
    address,
  });

  if (!data || data.status !== "1" || !Array.isArray(data.result)) {
    return [];
  }

  return data.result.map((t) => {
    const decimals = parseInt(t.decimals || "18", 10);
    let formattedBalance = t.balance;
    try {
      formattedBalance = formatUnits(BigInt(t.balance || "0"), decimals);
    } catch {
      // keep raw
    }
    return {
      balance: t.balance,
      formattedBalance,
      contractAddress: t.contractAddress,
      name: t.name,
      symbol: t.symbol,
      decimals: t.decimals,
      type: t.type || "ERC-20",
    };
  });
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
