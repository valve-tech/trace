import { createConfig } from "ponder";
import { ERC20_ABI } from "./abis/ERC20";
import { CURATED_TOKENS, START_BLOCK } from "./src/tokens";

/**
 * Ponder config — stopgap holder-balance indexer for a curated PulseChain
 * token set. One contract definition covers every curated token (same ERC-20
 * ABI, multiple addresses) so a single `ERC20:Transfer` handler indexes them
 * all.
 *
 * RPC: the Valve reth fleet (PULSECHAIN_RPC_URL), same node the API uses.
 * DB: the shared Postgres, isolated in its own schema (`indexer`) so it never
 * collides with the API's migrations.
 */
export default createConfig({
  chains: {
    pulsechain: {
      id: 369,
      rpc: process.env.PULSECHAIN_RPC_URL || "https://rpc.pulsechain.com",
    },
  },
  // Postgres schema isolation is set via the `--schema indexer` CLI flag /
  // DATABASE_SCHEMA env (not here) in Ponder 0.16 — see package.json scripts.
  database: {
    kind: "postgres",
    connectionString:
      process.env.DATABASE_URL ||
      "postgres://valvetech:valvetech@localhost:5432/valvetech",
  },
  contracts: {
    ERC20: {
      chain: "pulsechain",
      abi: ERC20_ABI,
      address: CURATED_TOKENS.map((t) => t.address),
      startBlock: START_BLOCK,
    },
  },
});
