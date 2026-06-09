/**
 * Request-scoped chain context.
 *
 * The `/api` + `/rpc` `chainContext` middleware resolves a request's target
 * chain once (from `?chainid` / a `chainid` body field) and runs the rest of
 * the handler inside `runWithChain`. Deep service code then reads the active
 * chain via `currentChainId()` / `chainClient()` without every function having
 * to thread `chainId` through its signature.
 *
 * Outside a request — background services (monitor, scheduler, action child
 * scripts) and unit tests that call a service directly — the store is empty and
 * everything resolves to `DEFAULT_CHAIN_ID` (369, PulseChain), preserving the
 * legacy single-chain behavior exactly.
 *
 * Every per-chain client comes from `getRpcClient` (the registry's valve
 * endpoints), so there is no `rpc.pulsechain.com` hardcoding behind this seam.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { type PublicClient } from "viem";
import {
  DEFAULT_CHAIN_ID,
  getChain,
  type ChainConfig,
} from "./registry.js";
import { getRpcClient } from "./clients.js";

const store = new AsyncLocalStorage<number>();

/** Run `fn` (and everything it awaits) with `chainId` as the active chain. */
export function runWithChain<T>(chainId: number, fn: () => T): T {
  return store.run(chainId, fn);
}

/** The active request's chainId, or the registry default outside a request. */
export function currentChainId(): number {
  return store.getStore() ?? DEFAULT_CHAIN_ID;
}

/** The active request's `ChainConfig`. */
export function currentChain(): ChainConfig {
  return getChain(currentChainId());
}

/**
 * The viem public client for the active request's chain — built from the
 * registry's per-chain valve RPC endpoint. Drop-in for the legacy singleton
 * `publicClient`: outside a request it's the 369 client, exactly as before.
 */
export function chainClient(): PublicClient {
  return getRpcClient(currentChainId());
}
