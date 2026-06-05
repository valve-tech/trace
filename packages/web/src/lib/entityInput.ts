/**
 * Recognizers for the things a user can paste to navigate: a tx hash, an
 * address, a 4byte function selector, or a block number. Shared by the ⌘K
 * palette and the landing-page search so both classify input identically.
 */

import { scanPath } from "./scanRoutes";
import { ALL_CHAINS, type ChainSelection } from "./chains";

export const HEX_TX = /^0x[a-fA-F0-9]{64}$/;
export const HEX_ADDR = /^0x[a-fA-F0-9]{40}$/;
export const HEX_SELECTOR = /^0x[a-fA-F0-9]{8}$/;
export const DIGITS = /^\d+$/;

export type EntityInputKind = "tx" | "address" | "selector" | "block";

/** Classify pasted input, or null if it matches none of the shapes. */
export function classifyInput(raw: string): EntityInputKind | null {
  const v = raw.trim();
  if (v === "") return null;
  if (HEX_TX.test(v)) return "tx";
  if (HEX_ADDR.test(v)) return "address";
  if (HEX_SELECTOR.test(v)) return "selector";
  if (DIGITS.test(v)) return "block";
  return null;
}

/**
 * The default explorer/debugger route for a recognized input, or null. When a
 * specific chain is selected (not "all chains"), the route carries `?chainid=N`
 * so the destination view scopes its data to that chain; the default/all-chains
 * case is left bare (resolves against the default chain).
 */
export function routeForInput(
  raw: string,
  chain: ChainSelection = ALL_CHAINS,
): string | null {
  const v = raw.trim();
  let base: string | null;
  switch (classifyInput(v)) {
    case "tx":
      base = scanPath("tx", v);
      break;
    case "address":
      base = scanPath("address", v);
      break;
    case "selector":
      // Not an EIP-3091 entity; placeholder until selector lookup is wired.
      base = `/explorer?selector=${v}`;
      break;
    case "block":
      base = scanPath("block", v);
      break;
    default:
      base = null;
  }
  if (base === null || chain === ALL_CHAINS) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}chainid=${chain}`;
}
