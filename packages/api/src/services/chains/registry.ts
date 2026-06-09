/**
 * Per-chain ChainConfig registry — the public face of the chains service and
 * the foundation for `?chainid=N` routing.
 *
 * The chain SET is no longer hardcoded here: `loadChains()` builds it from the
 * operator's `CHAINS_JSON` / `CHAINS_CONFIG_PATH` (see `loadConfig.ts`), or
 * falls back to the valve launch set (`defaults.ts`) when none is provided — so
 * the hosted deployment and every existing test are unchanged, while a
 * self-hoster can run Explore for any EVM chain without touching code.
 *
 * The public API (`ChainConfig`, `DEFAULT_CHAIN_ID`, `getChain`, `listChains`,
 * `isSupportedChain`) is stable — ~20 services import from here.
 */

import { loadChains } from "./loadConfig.js";

export type { ChainConfig } from "./types.js";
import { type ChainConfig } from "./types.js";

const { chains: CHAINS, defaultChainId } = loadChains();

/** The chain assumed when a request omits `chainid`. */
export const DEFAULT_CHAIN_ID = defaultChainId;

/** All registered chains, ascending by id. */
export function listChains(): ChainConfig[] {
  return Object.values(CHAINS).sort((a, b) => a.chainId - b.chainId);
}

/** True when `chainId` has a registry entry. */
export function isSupportedChain(chainId: number): boolean {
  return chainId in CHAINS;
}

/**
 * Resolve a chain's config. Throws on an unregistered id — callers that
 * accept user input should gate with `isSupportedChain` first and return a
 * 400, rather than letting this throw into a 500.
 */
export function getChain(chainId: number): ChainConfig {
  const config = CHAINS[chainId];
  if (!config) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }
  return config;
}
