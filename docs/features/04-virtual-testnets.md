# Feature 4: Virtual TestNets

**Status: TODO**

## Overview
Fork PulseChain at any block to create isolated sandbox environments with full mainnet state. Each fork gets its own RPC endpoint. Unlimited faucet, state manipulation, snapshot/revert.

## Endpoints
- `POST /api/testnets` — Create a new forked testnet
- `GET /api/testnets` — List all testnets
- `GET /api/testnets/:id` — Get testnet details (RPC URL, block, status)
- `DELETE /api/testnets/:id` — Destroy a testnet
- `POST /api/testnets/:id/snapshot` — Create a state snapshot
- `POST /api/testnets/:id/revert/:snapshotId` — Revert to snapshot
- `POST /api/testnets/:id/fund` — Faucet: set any address balance
- `POST /api/testnets/:id/time-travel` — Advance block timestamp
- `POST /api/testnets/:id/mine` — Mine N empty blocks

## Capabilities
- Fork PulseChain at any block number (or latest)
- Private JSON-RPC endpoint per fork (proxied through our API)
- Unlimited faucet for PLS and any PRC-20 token
- State manipulation: set balances, storage slots, contract code
- Snapshot/revert for test isolation
- Time travel: advance block timestamps
- Mine blocks on demand
- Auto-cleanup: destroy idle forks after configurable TTL
- Multiple concurrent forks

## Backend Architecture
- **Fork manager**: spawns and manages Anvil processes
  - `anvil --fork-url https://rpc.pulsechain.com --fork-block-number <N> --port <dynamic>`
  - Each fork gets a unique port, proxied through the API gateway
- **Process pool**: tracks running Anvil instances, health checks, TTL cleanup
- **RPC proxy**: routes requests to correct Anvil instance by testnet ID
- **Snapshot store**: maps snapshot IDs to Anvil's `evm_snapshot` return values

## Anvil Custom Methods Used
- `anvil_setBalance` — faucet
- `anvil_setCode` — deploy/replace contract code
- `anvil_setStorageAt` — modify storage slots
- `anvil_setNonce` — set account nonce
- `anvil_impersonateAccount` — send tx as any address
- `evm_snapshot` — create snapshot
- `evm_revert` — revert to snapshot
- `evm_increaseTime` — time travel
- `evm_mine` — mine blocks

## Frontend Components
- **TestNet dashboard** — list of active forks with RPC URLs, block info, age
- **Create fork dialog** — select source chain, block number, optional label
- **Fork control panel** — faucet form, snapshot/revert buttons, time travel, mine
- **Fork explorer** — mini block/tx explorer scoped to the fork
- **RPC endpoint display** — copyable URL for use in wallets/dapps

## Dependencies
- Anvil (from Foundry toolkit) must be installed on the server
