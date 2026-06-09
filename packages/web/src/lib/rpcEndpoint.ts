/**
 * Bring-your-own-RPC: per-chain endpoint resolution for client-side raw reads.
 *
 * By default every JSON-RPC call goes through Explore's own `/rpc` proxy (our
 * nodes). A user can override the endpoint **per chain** — pointing reads at
 * their own node or a provider key (Alchemy/Infura/etc.) — so heavy client-side
 * watching/charting runs on their infrastructure, not ours, and isn't rate
 * limited by our proxy. The override is stored in this browser only; the watch
 * list / read pattern never leaves the client.
 *
 * Mirrors the shape of `apiBase.ts` (the backend-origin override) but is a
 * distinct knob: `apiBase` is where enriched API calls go; this is where raw
 * chain RPC goes. When the app is served from IPFS with a user's own RPC set,
 * raw reads need no valve backend at all.
 *
 * Unlike the backend-origin override, an RPC URL keeps its **full path + query**
 * (provider keys live there, e.g. `…/v2/<KEY>`), so we validate the protocol
 * but preserve the rest verbatim.
 */

import { apiUrl } from "./apiBase.js";
import { DEFAULT_CHAIN_ID } from "./chains.js";

/** Per-chain localStorage key, e.g. `explore:rpcUrl:369`. */
export function rpcOverrideKey(chainId: number): string {
  return `explore:rpcUrl:${chainId}`;
}

/**
 * Accept only http(s) URLs; preserve path + query (provider keys live there).
 * Returns the normalized URL string, or null for anything non-http(s) or
 * unparseable — so a `javascript:`/garbage value can never become an endpoint.
 */
export function sanitizeRpcUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.toString();
}

/** The user's RPC override for a chain (sanitized), or null when unset/invalid. */
export function getRpcOverride(chainId: number): string | null {
  if (typeof localStorage === "undefined") return null;
  return sanitizeRpcUrl(localStorage.getItem(rpcOverrideKey(chainId)));
}

/**
 * Persist an RPC override for a chain. Returns the normalized URL stored, or
 * null when the input is rejected (nothing is written for invalid input).
 * Takes effect on the next read — endpoints are resolved per call.
 */
export function setRpcOverride(chainId: number, value: string): string | null {
  const url = sanitizeRpcUrl(value);
  if (!url) return null;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(rpcOverrideKey(chainId), url);
  }
  return url;
}

/** Remove a chain's RPC override, reverting that chain to the `/rpc` proxy. */
export function clearRpcOverride(chainId: number): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(rpcOverrideKey(chainId));
  }
}

/**
 * Resolve the endpoint a raw JSON-RPC call for `chainId` should POST to:
 *   - user override set  → that URL verbatim (their node is single-chain, so
 *                          no `?chainid` is appended).
 *   - no override        → Explore's `/rpc` proxy, scoped with `?chainid=N`
 *                          for non-default chains (byte-identical to the legacy
 *                          path, so default behavior is unchanged).
 */
export function resolveRpcUrl(chainId: number): string {
  const override = getRpcOverride(chainId);
  if (override) return override;
  const base = apiUrl("/rpc");
  return chainId === DEFAULT_CHAIN_ID ? base : `${base}?chainid=${chainId}`;
}

/** True when reads for this chain are pointed at a user-supplied endpoint. */
export function isRpcOverridden(chainId: number): boolean {
  return getRpcOverride(chainId) !== null;
}
