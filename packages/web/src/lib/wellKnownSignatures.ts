/**
 * Well-known function signatures for common EVM interfaces.
 * Checked before the 4byte API — instant recognition for proxies
 * and unverified contracts.
 */

export interface WellKnownSig {
  interface: string;
  name: string;
  signature: string;
}

// selector → { interface, name, signature }
const WELL_KNOWN: Record<string, WellKnownSig> = {};

// Selectors are pre-computed keccak256 hashes of the canonical signatures

// ---------------------------------------------------------------------------
// ERC20
// ---------------------------------------------------------------------------
const ERC20: Array<[string, string]> = [
  ["0x06fdde03", "name()"],
  ["0x95d89b41", "symbol()"],
  ["0x313ce567", "decimals()"],
  ["0x18160ddd", "totalSupply()"],
  ["0x70a08231", "balanceOf(address)"],
  ["0xa9059cbb", "transfer(address,uint256)"],
  ["0x23b872dd", "transferFrom(address,address,uint256)"],
  ["0x095ea7b3", "approve(address,uint256)"],
  ["0xdd62ed3e", "allowance(address,address)"],
];

for (const [sel, sig] of ERC20) {
  WELL_KNOWN[sel] = { interface: "ERC20", name: sig.split("(")[0]!, signature: sig };
}

// ---------------------------------------------------------------------------
// ERC20 extensions
// ---------------------------------------------------------------------------
const ERC20_EXT: Array<[string, string]> = [
  ["0xd505accf", "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"],
  ["0x3644e515", "DOMAIN_SEPARATOR()"],
  ["0x7ecebe00", "nonces(address)"],
  ["0x40c10f19", "mint(address,uint256)"],
  ["0x42966c68", "burn(uint256)"],
  ["0x79cc6790", "burnFrom(address,uint256)"],
  ["0xa457c2d7", "decreaseAllowance(address,uint256)"],
  ["0x39509351", "increaseAllowance(address,uint256)"],
];

for (const [sel, sig] of ERC20_EXT) {
  WELL_KNOWN[sel] = { interface: "ERC20", name: sig.split("(")[0]!, signature: sig };
}

// ---------------------------------------------------------------------------
// ERC721
// ---------------------------------------------------------------------------
const ERC721: Array<[string, string]> = [
  ["0x6352211e", "ownerOf(uint256)"],
  ["0x42842e0e", "safeTransferFrom(address,address,uint256)"],
  ["0xb88d4fde", "safeTransferFrom(address,address,uint256,bytes)"],
  ["0x081812fc", "getApproved(uint256)"],
  ["0xa22cb465", "setApprovalForAll(address,bool)"],
  ["0xe985e9c5", "isApprovedForAll(address,address)"],
  ["0xc87b56dd", "tokenURI(uint256)"],
];

for (const [sel, sig] of ERC721) {
  WELL_KNOWN[sel] = { interface: "ERC721", name: sig.split("(")[0]!, signature: sig };
}

// ---------------------------------------------------------------------------
// ERC1155
// ---------------------------------------------------------------------------
const ERC1155: Array<[string, string]> = [
  ["0x00fdd58e", "balanceOf(address,uint256)"],
  ["0x4e1273f4", "balanceOfBatch(address[],uint256[])"],
  ["0xf242432a", "safeTransferFrom(address,address,uint256,uint256,bytes)"],
  ["0x2eb2c2d6", "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)"],
  ["0x0e89341c", "uri(uint256)"],
];

for (const [sel, sig] of ERC1155) {
  WELL_KNOWN[sel] = { interface: "ERC1155", name: sig.split("(")[0]!, signature: sig };
}

// ---------------------------------------------------------------------------
// Common DeFi (Uniswap V2/V3, WETH)
// ---------------------------------------------------------------------------
const DEFI: Array<[string, string, string]> = [
  // WETH
  ["0xd0e30db0", "WETH", "deposit()"],
  ["0x2e1a7d4d", "WETH", "withdraw(uint256)"],
  // Uniswap V2 Router
  ["0x38ed1739", "UniswapV2Router", "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)"],
  ["0x8803dbee", "UniswapV2Router", "swapTokensForExactTokens(uint256,uint256,address[],address,uint256)"],
  ["0x7ff36ab5", "UniswapV2Router", "swapExactETHForTokens(uint256,address[],address,uint256)"],
  ["0x18cbafe5", "UniswapV2Router", "swapExactTokensForETH(uint256,uint256,address[],address,uint256)"],
  ["0xfb3bdb41", "UniswapV2Router", "swapETHForExactTokens(uint256,address[],address,uint256)"],
  ["0xe8e33700", "UniswapV2Router", "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)"],
  ["0xf305d719", "UniswapV2Router", "addLiquidityETH(address,uint256,uint256,uint256,address,uint256)"],
  ["0xbaa2abde", "UniswapV2Router", "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)"],
  ["0x02751cec", "UniswapV2Router", "removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)"],
  ["0xb6f9de95", "UniswapV2Router", "swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)"],
  ["0x791ac947", "UniswapV2Router", "swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)"],
  ["0x5c11d795", "UniswapV2Router", "swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)"],
  // Uniswap V2 Pair
  ["0x0902f1ac", "UniswapV2Pair", "getReserves()"],
  ["0x022c0d9f", "UniswapV2Pair", "swap(uint256,uint256,address,bytes)"],
  ["0x6a627842", "UniswapV2Pair", "mint(address)"],
  ["0x89afcb44", "UniswapV2Pair", "burn(address)"],
  ["0xfff6cae9", "UniswapV2Pair", "sync()"],
  ["0x0dfe1681", "UniswapV2Pair", "token0()"],
  ["0xd21220a7", "UniswapV2Pair", "token1()"],
  // Uniswap V2 Factory
  ["0xc9c65396", "UniswapV2Factory", "createPair(address,address)"],
  ["0xe6a43905", "UniswapV2Factory", "getPair(address,address)"],
  // Multicall
  ["0xac9650d8", "Multicall", "multicall(bytes[])"],
  ["0x5ae401dc", "Multicall", "multicall(uint256,bytes[])"],
  // Ownable
  ["0x8da5cb5b", "Ownable", "owner()"],
  ["0xf2fde38b", "Ownable", "transferOwnership(address)"],
  ["0x715018a6", "Ownable", "renounceOwnership()"],
  // Proxy
  ["0x5c60da1b", "Proxy", "implementation()"],
  ["0x3659cfe6", "Proxy", "upgradeTo(address)"],
  ["0x4f1ef286", "Proxy", "upgradeToAndCall(address,bytes)"],
];

for (const [sel, iface, sig] of DEFI) {
  WELL_KNOWN[sel] = { interface: iface, name: sig.split("(")[0]!, signature: sig };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function lookupWellKnown(selector: string): WellKnownSig | undefined {
  const normalized = selector.toLowerCase().startsWith("0x")
    ? selector.toLowerCase().slice(0, 10)
    : `0x${selector.toLowerCase().slice(0, 8)}`;
  return WELL_KNOWN[normalized];
}

export function getInterfaceName(selector: string): string | undefined {
  return lookupWellKnown(selector)?.interface;
}
