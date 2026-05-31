import { formatUnits } from "viem";

/**
 * Pure transforms for token-transfer rows. Two upstream shapes (the
 * v2 per-tx endpoint and the v1 address-based fallback) flatten into
 * the same TokenTransferView. The defensive `safeFormatUnits` survives
 * malformed `value` or `decimals` from either feed.
 */

export interface TokenTransferView {
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
 * Format a wei-style integer string using a string-encoded decimal
 * count. Missing / non-numeric `decimalsStr` defaults to 18 (the most
 * common ERC-20 case); missing / non-numeric `value` defaults to "0".
 * Falls back to the raw `value` string on any BigInt parse failure
 * rather than throwing — keeps the column rendering even when the
 * upstream sends garbage.
 */
export function safeFormatUnits(
  value: string,
  decimalsStr: string | undefined,
): string {
  const decimals = parseInt(decimalsStr || "18", 10);
  try {
    return formatUnits(BigInt(value || "0"), decimals);
  } catch {
    return value;
  }
}

export interface BlockscoutV2Row {
  from: { hash: string };
  to: { hash: string };
  total: { value: string; decimals: string };
  token: {
    name: string;
    symbol: string;
    address: string;
    decimals: string;
  };
}

/**
 * Flatten a Blockscout v2 token-transfer row into the canonical view.
 * The v2 shape nests address/total/token; the view flattens them so
 * the consumer can render without traversing.
 */
export function mapV2Row(row: BlockscoutV2Row, hash: string): TokenTransferView {
  return {
    from: row.from.hash,
    to: row.to.hash,
    value: row.total.value,
    formattedValue: safeFormatUnits(row.total.value, row.token.decimals),
    tokenName: row.token.name,
    tokenSymbol: row.token.symbol,
    tokenDecimal: row.token.decimals,
    contractAddress: row.token.address,
    hash,
  };
}

export interface BlockscoutV1Row {
  from: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
  hash: string;
}

/**
 * Flatten a Blockscout v1 token-transfer row. Already in flat shape;
 * the only transform is running `value` through safeFormatUnits.
 */
export function mapV1Row(row: BlockscoutV1Row): TokenTransferView {
  return {
    from: row.from,
    to: row.to,
    value: row.value,
    formattedValue: safeFormatUnits(row.value, row.tokenDecimal),
    tokenName: row.tokenName,
    tokenSymbol: row.tokenSymbol,
    tokenDecimal: row.tokenDecimal,
    contractAddress: row.contractAddress,
    hash: row.hash,
  };
}
