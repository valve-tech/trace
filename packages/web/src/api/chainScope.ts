import { DEFAULT_CHAIN_ID } from "../lib/chains";

/**
 * Scope a request URL to a chain via the `?chainid=N` dispatcher param.
 * The default chain omits the param so its requests stay byte-identical
 * to the single-chain era (and to what the backend treats as its
 * fallback chain).
 */
export function scoped(url: string, chainId: number = DEFAULT_CHAIN_ID): string {
  if (chainId === DEFAULT_CHAIN_ID) return url;
  return url + (url.includes("?") ? "&" : "?") + `chainid=${chainId}`;
}
