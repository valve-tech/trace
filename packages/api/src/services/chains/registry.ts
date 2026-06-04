import { type Chain } from "viem";
import { mainnet, pulsechain, pulsechainV4 } from "viem/chains";

/**
 * Per-chain configuration registry — the foundation for `?chainid=N` routing
 * (see docs/superpowers/specs/2026-05-29-multichain-etherscan-labels-design.md)
 * and the first consumer, the workspace portfolio tracker.
 *
 * This is ADDITIVE: the legacy single-chain `publicClient` in `../rpc.ts`
 * stays as-is for the existing PulseChain-only explorer surface. New
 * multichain code resolves a `ChainConfig` by id here instead of reading the
 * hardcoded `PULSECHAIN_*` env vars.
 *
 * `chifraChain` is the load-bearing field for the portfolio feature: it's the
 * chain slug the TrueBlocks daemon expects (`chain=` query param). The slugs
 * here are verified against `chifra.valve.city/status?chains=true` —
 * NOTE 943 is `pulsechain-v4` (symbol `v4PLS`), not the `pulsechain-testnet` /
 * `tPLS` the web registry (`packages/web/src/lib/chains.ts`) currently assumes.
 * The daemon + viem agree on `v4PLS`; the web registry is the outlier to
 * reconcile when chainid routing lands on the frontend.
 */

export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  nativeSymbol: string;
  nativeDecimals: 18;

  /** TrueBlocks daemon chain slug — passed as `chain=` to the SDK. */
  chifraChain: string;

  rpcUrl: string;
  /** debug_traceTransaction-capable node, when distinct from rpcUrl. */
  debugRpcUrl?: string;
  /** Public Reth snapshot, when one exists for this chain. */
  rethSnapshotUrl?: string;
  /**
   * Substreams (firehose) gRPC endpoint, `evm-{chainId}-substreams.valve.city`.
   * The planned long-term data layer for holdings + XYK prices (a `.spkg`
   * module → substreams-sink-sql → Postgres). 943 confirmed by the user
   * 2026-06-02 ("will be"); 1/369 follow the same naming, pending standup.
   */
  substreamsEndpoint?: string;

  /** Blockscout API base; omitted when we don't run/point at one. */
  blockscoutBase?: string;
  sourcifyEnabled: boolean;

  viemChain: Chain;

  /** URL path prefix once chainid routing lands on the web side. */
  explorerSlug: string;
  defaultBlockTimeSeconds: number;
  testnet: boolean;
}

/** The chain assumed when a request omits `chainid`. */
export const DEFAULT_CHAIN_ID = 369;

const CHAINS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    shortName: "eth",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    chifraChain: "mainnet",
    // Default to valve's own RPC with the public, per-IP-rate-limited vk_demo
    // key (right for basic/one-off reads like portfolio balanceOf); production
    // overrides via env with the valve.city unlimited key.
    rpcUrl: process.env.ETH_RPC_URL || "https://evm-1-rpc.valve.city/v1/vk_demo/evm/1",
    rethSnapshotUrl: "https://evm1-snapshot-reth.valve.city",
    substreamsEndpoint: "evm-1-substreams.valve.city",
    sourcifyEnabled: true,
    viemChain: mainnet,
    explorerSlug: "ethereum",
    defaultBlockTimeSeconds: 12,
    testnet: false,
  },
  369: {
    chainId: 369,
    name: "PulseChain",
    shortName: "pls",
    nativeSymbol: "PLS",
    nativeDecimals: 18,
    chifraChain: "pulsechain",
    rpcUrl: process.env.PULSECHAIN_RPC_URL || "https://evm-369-rpc.valve.city/v1/vk_demo/evm/369",
    debugRpcUrl: process.env.DEBUG_RPC_URL || undefined,
    rethSnapshotUrl: "https://evm369-snapshot-reth.valve.city",
    substreamsEndpoint: "evm-369-substreams.valve.city",
    blockscoutBase:
      process.env.BLOCKSCOUT_API_URL || "https://api.scan.pulsechain.com/api",
    sourcifyEnabled: true,
    viemChain: pulsechain,
    explorerSlug: "pulsechain",
    defaultBlockTimeSeconds: 10,
    testnet: false,
  },
  943: {
    chainId: 943,
    name: "PulseChain Testnet v4",
    shortName: "plsv4",
    nativeSymbol: "v4PLS",
    nativeDecimals: 18,
    chifraChain: "pulsechain-v4",
    rpcUrl: process.env.PULSECHAIN_V4_RPC_URL || "https://evm-943-rpc.valve.city/v1/vk_demo/evm/943",
    rethSnapshotUrl: "https://evm943-snapshot-reth.valve.city",
    substreamsEndpoint: "evm-943-substreams.valve.city",
    sourcifyEnabled: false,
    viemChain: pulsechainV4,
    explorerSlug: "pulsechain-testnet",
    defaultBlockTimeSeconds: 10,
    testnet: true,
  },
};

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
