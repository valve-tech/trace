/**
 * Canonical block-explorer routes, per EIP-3091
 * (https://eips.ethereum.org/EIPS/eip-3091). All scan navigation goes through
 * here so the path scheme stays consistent — never query strings.
 *
 *   tx       → /tx/<hash>
 *   block    → /block/<number|hash>
 *   address  → /address/<address>   (EOA or unknown)
 *   contract → /token/<address>     (a contract-detail page)
 */
export type ScanKind = "tx" | "block" | "address" | "contract";

export function scanPath(kind: ScanKind, value: string): string {
  switch (kind) {
    case "tx":
      return `/tx/${value}`;
    case "block":
      return `/block/${value}`;
    case "address":
      return `/address/${value}`;
    case "contract":
      return `/token/${value}`;
  }
}
