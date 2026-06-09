/**
 * Pure transforms for token-transfer rows. Two upstream shapes (the
 * v2 per-tx endpoint and the v1 address-based fallback) flatten into
 * the same TokenTransferView.
 *
 * The view carries the RAW integer `value` (base units) and the token's
 * `tokenDecimal` — a faithful 1:1 reflection of chain data, matching the
 * Etherscan `tokentx` shape. We do NOT serve a pre-scaled `formattedValue`:
 * scaling is a display concern done at the render edge (`formatAmountDisplay`),
 * so the API never guesses a decimals default or rounds an amount.
 */

export interface TokenTransferView {
  from: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
  hash: string;
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
 * Flatten a Blockscout v1 token-transfer row. Already in flat shape, so this is
 * a straight pass-through — the raw `value` + `tokenDecimal` are carried as-is.
 */
export function mapV1Row(row: BlockscoutV1Row): TokenTransferView {
  return {
    from: row.from,
    to: row.to,
    value: row.value,
    tokenName: row.tokenName,
    tokenSymbol: row.tokenSymbol,
    tokenDecimal: row.tokenDecimal,
    contractAddress: row.contractAddress,
    hash: row.hash,
  };
}
