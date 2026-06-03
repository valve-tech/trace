import { createPublicClient, http, type PublicClient } from "viem";
import { getChain } from "./registry.js";

/**
 * Per-chain viem client factory (the 2026-05-29 multichain spec's
 * `getRpcClient`). Memoized one client per chainId, built from the
 * `ChainConfig` registry. Additive — the legacy single-chain `publicClient`
 * in ../rpc.ts is untouched; new multichain code resolves by id here.
 */

const clients = new Map<number, PublicClient>();

export function getRpcClient(chainId: number): PublicClient {
  const cached = clients.get(chainId);
  if (cached) return cached;

  const chain = getChain(chainId);
  const client = createPublicClient({
    chain: chain.viemChain,
    transport: http(chain.rpcUrl, { batch: true, retryCount: 2, timeout: 30_000 }),
  });
  clients.set(chainId, client);
  return client;
}
