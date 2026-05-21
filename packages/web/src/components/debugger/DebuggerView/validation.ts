/** True iff `hash` is a `0x`-prefixed 64-hex-char Ethereum transaction hash. */
export function isValidTxHash(hash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(hash);
}
