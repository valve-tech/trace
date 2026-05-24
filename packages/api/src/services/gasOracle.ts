/**
 * Priority-fee oracle for PulseChain, via @valve-tech/gas-oracle.
 *
 * Runs ONE server-side poller (shared across all clients) that watches recent
 * blocks ∪ the pending mempool and computes slow/standard/fast/instant tier
 * recommendations. The tip figures are mempool-influenced: the tier
 * distribution is the union of the last block's tips and pending-pool tips
 * (PulseChain's Reth exposes txpool_content, confirmed), so the readout
 * reflects what it actually takes to land in the next block — not just what
 * already landed.
 *
 * A dedicated viem client isolates the oracle's background poll loop from the
 * shared request client in rpc.ts.
 */

import { createPublicClient, http, type PublicClient } from "viem";
import { gasOracleActions } from "@valve-tech/gas-oracle/viem-actions";
import type { GasOracleState } from "@valve-tech/gas-oracle";
import { pulsechain } from "./rpc.js";

const RPC_URL =
  process.env.PULSECHAIN_RPC_URL || "https://rpc.pulsechain.com";

const oracleClient = createPublicClient({
  chain: pulsechain,
  transport: http(RPC_URL, { timeout: 30_000 }),
});

// Call the actions factory directly rather than client.extend(): the package
// pins a different viem release, so .extend()'s structural types collapse to
// `never`. The cast bridges the viem-version skew — the client is a
// structurally valid PublicClient at runtime.
const oracle = gasOracleActions({
  chainId: 369,
  priorityModel: "eip1559",
  // Retain the normalized mempool snapshot so a future /mempool view can
  // reuse this poller for findInMempool / tipForBlockPosition.
  keepMempoolSnapshot: true,
  // Eager: first read is served from a populated cache.
  lifecycle: "eager",
})(oracleClient as unknown as PublicClient);

/** Latest tier snapshot (base fee, trend, mempool stats, 4 tiers). */
export async function getGasTiers(): Promise<GasOracleState> {
  return oracle.getGasTiers();
}

/** Stop the background poller (graceful shutdown). Idempotent. */
export function stopGasOracle(): void {
  oracle.stopGasOracle();
}
