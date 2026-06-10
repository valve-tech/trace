/**
 * Priority-fee oracle, via @valve-tech/gas-oracle — one poller per chain.
 *
 * Each chain's oracle runs ONE server-side poller (shared across all clients
 * of that chain) that watches recent blocks ∪ the pending mempool and computes
 * slow/standard/fast/instant tier recommendations. The tip figures are
 * mempool-influenced: the tier distribution is the union of the last block's
 * tips and pending-pool tips (Reth exposes txpool_content), so the readout
 * reflects what it actually takes to land in the next block — not just what
 * already landed.
 *
 * Oracles are created lazily on a chain's first gas request, so idle chains
 * cost nothing. A dedicated viem client isolates each poll loop from the
 * shared request clients.
 */

import { createPublicClient, http, type PublicClient } from "viem";
import { gasOracleActions } from "@valve-tech/gas-oracle/viem-actions";
import type { GasOracleState } from "@valve-tech/gas-oracle";
import { getChain } from "./chains/registry.js";
import { currentChainId } from "./chains/context.js";

type Oracle = ReturnType<ReturnType<typeof gasOracleActions>>;

const oracles = new Map<number, Oracle>();

function getOracle(chainId: number): Oracle {
  const existing = oracles.get(chainId);
  if (existing) return existing;

  const config = getChain(chainId);
  const oracleClient = createPublicClient({
    chain: config.viemChain,
    transport: http(config.rpcUrl, { timeout: 30_000 }),
  });

  // Call the actions factory directly rather than client.extend(): the package
  // pins a different viem release, so .extend()'s structural types collapse to
  // `never`. The cast bridges the viem-version skew — the client is a
  // structurally valid PublicClient at runtime.
  const oracle = gasOracleActions({
    chainId,
    priorityModel: "eip1559",
    // Retain the normalized mempool snapshot so a future /mempool view can
    // reuse this poller for findInMempool / tipForBlockPosition.
    keepMempoolSnapshot: true,
    // Eager: first read is served from a populated cache.
    lifecycle: "eager",
  })(oracleClient as unknown as PublicClient);

  oracles.set(chainId, oracle);
  return oracle;
}

/** Latest tier snapshot (base fee, trend, mempool stats, 4 tiers) for the active chain. */
export async function getGasTiers(): Promise<GasOracleState> {
  return getOracle(currentChainId()).getGasTiers();
}

/** Stop every chain's background poller (graceful shutdown). Idempotent. */
export function stopGasOracle(): void {
  for (const oracle of oracles.values()) oracle.stopGasOracle();
  oracles.clear();
}
