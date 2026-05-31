import { formatEther, formatUnits } from "viem";

/**
 * Pure transforms for the address-explorer service. Each function maps
 * one raw row (Blockscout txlist / tokenlist) or one viem getTransaction
 * result into the shape the addresses.ts caller wants to return.
 *
 * Extracted so the defensive fallbacks (missing fields, malformed
 * BigInt input, getTransaction failure) are testable without mocking
 * external clients — the parent fetcher is just a thin shell around
 * these.
 */

export interface BlockscoutTxListRow {
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
}

export interface AddressTransactionBase {
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
}

/**
 * Map a Blockscout txlist row into the API's base transaction shape.
 * Missing/empty `value` is treated as zero wei (Blockscout sometimes
 * sends empty strings on internal failures), and `functionName` /
 * `methodId` default to empty strings so consumers can safely
 * concatenate.
 */
export function mapTxListRow(row: BlockscoutTxListRow): AddressTransactionBase {
  return {
    hash: row.hash,
    blockNumber: row.blockNumber,
    timeStamp: row.timeStamp,
    from: row.from,
    to: row.to,
    value: row.value,
    valuePLS: formatEther(BigInt(row.value || "0")),
    gas: row.gas,
    gasUsed: row.gasUsed,
    gasPrice: row.gasPrice,
    isError: row.isError,
    functionName: row.functionName || "",
    methodId: row.methodId || "",
    input: row.input,
  };
}

export interface BlockscoutTokenRow {
  balance: string;
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: string;
  type: string;
}

export interface AddressTokenView {
  balance: string;
  formattedBalance: string;
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: string;
  type: string;
}

/**
 * Map a Blockscout tokenlist row into the API's token-view shape.
 * Missing/malformed `balance` or `decimals` falls back to the raw
 * balance string (formatUnits would throw on garbage input). `type`
 * defaults to "ERC-20" when Blockscout omits it.
 */
export function mapTokenRow(row: BlockscoutTokenRow): AddressTokenView {
  const decimals = parseInt(row.decimals || "18", 10);
  let formattedBalance = row.balance;
  try {
    formattedBalance = formatUnits(BigInt(row.balance || "0"), decimals);
  } catch {
    // Keep the raw balance string — better than throwing.
  }
  return {
    balance: row.balance,
    formattedBalance,
    contractAddress: row.contractAddress,
    name: row.name,
    symbol: row.symbol,
    decimals: row.decimals,
    type: row.type || "ERC-20",
  };
}

export interface FeeFields {
  type: string;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
}

/**
 * Extract the EIP-1559 fee fields + tx type from a viem
 * getTransaction result. Missing values render as `null` (the wire
 * shape the frontend expects). Used to enrich Blockscout txlist
 * results, which omit these fields. The defensive null defaults make
 * legacy txs (no maxFee fields at all) render correctly.
 */
export function extractTxTypeAndFees(tx: {
  type?: string;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}): FeeFields {
  return {
    type: tx.type ?? "legacy",
    maxFeePerGas: tx.maxFeePerGas != null ? tx.maxFeePerGas.toString() : null,
    maxPriorityFeePerGas:
      tx.maxPriorityFeePerGas != null
        ? tx.maxPriorityFeePerGas.toString()
        : null,
  };
}

/**
 * The fallback fee-field set used when getTransaction throws for a
 * given hash (e.g. the tx is in the mempool but not yet mined). The
 * Blockscout row still carries the basic info, so the row renders;
 * just the 1559 caps are unknown.
 */
export const LEGACY_FALLBACK_FEES: FeeFields = {
  type: "legacy",
  maxFeePerGas: null,
  maxPriorityFeePerGas: null,
};
